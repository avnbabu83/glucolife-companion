"""File storage adapter: private S3 bucket in production, local folder for development and tests.

Keys always look like users/{user_id}/uploads/{uuid}.{ext}. Reads go through
short-lived signed URLs (S3 presigned GET, or an HMAC-signed local URL).
"""

from __future__ import annotations

import hashlib
import hmac
import shutil
import time
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

from app.config import get_settings

PRESIGN_SECONDS = 3600


class Storage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def presigned_url(self, key: str, expires: int = PRESIGN_SECONDS) -> str: ...
    def list_keys(self, prefix: str) -> list[str]: ...
    def delete_prefix(self, prefix: str) -> int: ...


def _check_key(key: str) -> None:
    if not key or key.startswith("/") or ".." in key.split("/"):
        raise ValueError("Invalid storage key")


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        _check_key(key)
        return self.root / key

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def _signature(self, key: str, expires: int) -> str:
        secret = get_settings().jwt_secret.encode()
        return hmac.new(secret, f"{key}:{expires}".encode(), hashlib.sha256).hexdigest()

    def presigned_url(self, key: str, expires: int = PRESIGN_SECONDS) -> str:
        exp = int(time.time()) + expires
        return f"/api/v1/files/{quote(key)}?expires={exp}&sig={self._signature(key, exp)}"

    def verify(self, key: str, expires: int, sig: str) -> bool:
        return expires >= time.time() and hmac.compare_digest(sig, self._signature(key, expires))

    def list_keys(self, prefix: str) -> list[str]:
        base = self.root
        if not base.exists():
            return []
        return sorted(
            str(p.relative_to(base)).replace("\\", "/")
            for p in base.rglob("*")
            if p.is_file() and str(p.relative_to(base)).replace("\\", "/").startswith(prefix)
        )

    def delete_prefix(self, prefix: str) -> int:
        keys = self.list_keys(prefix)
        for key in keys:
            self._path(key).unlink(missing_ok=True)
        folder = self.root / prefix.rstrip("/")
        if prefix.endswith("/") and folder.is_dir():
            shutil.rmtree(folder, ignore_errors=True)
        return len(keys)


class S3Storage:
    def __init__(self, bucket: str, region: str, endpoint_url: str = "") -> None:
        import boto3

        if not bucket:
            raise RuntimeError("S3_BUCKET must be set when STORAGE_BACKEND=s3")
        self.bucket = bucket
        self.s3 = boto3.client("s3", region_name=region, endpoint_url=endpoint_url or None)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        _check_key(key)
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes:
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def presigned_url(self, key: str, expires: int = PRESIGN_SECONDS) -> str:
        return self.s3.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires
        )

    def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        for page in self.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return keys

    def delete_prefix(self, prefix: str) -> int:
        """Delete every version and delete marker under the prefix (the bucket is versioned)."""
        count = 0
        for page in self.s3.get_paginator("list_object_versions").paginate(Bucket=self.bucket, Prefix=prefix):
            objects = [
                {"Key": v["Key"], "VersionId": v["VersionId"]}
                for v in page.get("Versions", []) + page.get("DeleteMarkers", [])
            ]
            for i in range(0, len(objects), 1000):
                batch = objects[i:i + 1000]
                self.s3.delete_objects(Bucket=self.bucket, Delete={"Objects": batch, "Quiet": True})
                count += len(batch)
        return count


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        if s.storage_backend == "s3":
            _storage = S3Storage(s.s3_bucket, s.aws_region, s.s3_endpoint_url)
        else:
            _storage = LocalStorage(s.local_storage_dir)
    return _storage


def set_storage(storage: Storage | None) -> None:
    global _storage
    _storage = storage
