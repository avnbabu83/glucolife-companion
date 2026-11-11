"""POST /api/v1/uploads (photos into private storage) and signed local file reads."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.auth.deps import current_user
from app.models import User
from app.storage import LocalStorage, get_storage

router = APIRouter(tags=["uploads"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
HEIC_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1"}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic"}


def sniff_image(data: bytes) -> str | None:
    """Detect the image type from its magic bytes (the client's Content-Type is not trusted)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in HEIC_BRANDS:
        return "image/heic"
    return None


@router.post("/api/v1/uploads", status_code=201)
def upload(file: UploadFile = File(...), user: User = Depends(current_user)) -> dict:
    """Upload a jpeg/png/webp/heic photo (10 MB max). Returns file_key and a 1-hour file_url."""
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 10 MB")
    content_type = sniff_image(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, WebP and HEIC images are accepted")
    key = f"users/{user.id}/uploads/{uuid.uuid4().hex}.{EXTENSIONS[content_type]}"
    storage = get_storage()
    storage.put(key, data, content_type)
    return {"file_key": key, "file_url": storage.presigned_url(key)}


@router.get("/api/v1/files/{key:path}", include_in_schema=False)
def local_file(key: str, expires: int = Query(...), sig: str = Query(...)) -> Response:
    """Serve a file from local storage via a signed, expiring URL (development backend only)."""
    storage = get_storage()
    if not isinstance(storage, LocalStorage) or not storage.verify(key, expires, sig) or not storage.exists(key):
        raise HTTPException(status_code=404, detail="Not found")
    data = storage.get(key)
    return Response(content=data, media_type=sniff_image(data) or "application/octet-stream")
