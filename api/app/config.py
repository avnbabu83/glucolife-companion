"""Runtime configuration read from environment variables.

Nothing secret is stored in code. In production (APP_ENV=production) the
secrets JWT_SECRET and CREDENTIALS_KEY must be provided (AWS Secrets Manager
injects them as environment variables into the ECS task). For local runs and
the preview, missing secrets are generated once and kept in api/.data/
(git-ignored) so restarts keep working.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = API_DIR / ".data"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _list(name: str) -> list[str]:
    return [v.strip() for v in _env(name).split(",") if v.strip()]


def _bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _dev_secrets() -> dict:
    """Load or create per-checkout development secrets (never used in production)."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "dev-secrets.json"
    if path.exists():
        return json.loads(path.read_text())
    values = {
        "jwt_secret": secrets.token_urlsafe(48),
        "credentials_key": base64.b64encode(secrets.token_bytes(32)).decode(),
    }
    path.write_text(json.dumps(values))
    return values


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


@dataclass
class Settings:
    app_env: str
    database_url: str
    jwt_secret: str
    credentials_key: bytes
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cookie_secure: bool = True
    apple_client_ids: list[str] = field(default_factory=list)
    google_client_ids: list[str] = field(default_factory=list)
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""
    storage_backend: str = "local"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    aws_region: str = "us-east-1"
    local_storage_dir: str = ""
    email_backend: str = "console"
    email_from: str = "DiabetEasy <insights@diabeteasy.com>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    ai_timeout_seconds: float = 60.0
    ai_daily_limit: int = 20
    fitbit_client_id: str = ""
    fitbit_client_secret: str = ""
    fitbit_redirect_uri: str = "https://diabeteasy.com/integrations/fitbit/callback"
    # Phase 4: Dexcom API v3 (unset client id = Dexcom not offered, clients keep the simulation).
    dexcom_client_id: str = ""
    dexcom_client_secret: str = ""
    dexcom_base_url: str = "https://sandbox-api.dexcom.com"
    dexcom_redirect_uris: list[str] = field(default_factory=list)
    auth_rate_limit_per_minute: int = 30
    # Phase 1c: trusted header carrying the client IP (CloudFront-Viewer-Address in AWS).
    client_ip_header: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


def load_settings() -> Settings:
    app_env = _env("APP_ENV", "development").lower()
    jwt_secret = _env("JWT_SECRET")
    # ENCRYPTION_KEY is accepted as an alias of CREDENTIALS_KEY (the AES-GCM key, 32 bytes base64).
    credentials_key_b64 = _env("CREDENTIALS_KEY") or _env("ENCRYPTION_KEY")
    if jwt_secret and len(jwt_secret.encode()) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 bytes long")
    if app_env == "production":
        missing = [n for n, v in (("JWT_SECRET", jwt_secret), ("CREDENTIALS_KEY", credentials_key_b64)) if not v]
        if missing:
            raise RuntimeError(f"Missing required secrets in production: {', '.join(missing)}")
        problems = []
        if not _env("S3_BUCKET"):
            problems.append("S3_BUCKET is missing")
        if not _env("ANTHROPIC_API_KEY"):
            problems.append("ANTHROPIC_API_KEY is missing")
        if _env("EMAIL_BACKEND").lower() in {"", "console"}:
            problems.append("EMAIL_BACKEND must be a real backend (not console or empty)")
        if problems:
            raise RuntimeError(f"Invalid production settings: {'; '.join(problems)}")
    if not jwt_secret or not credentials_key_b64:
        dev = _dev_secrets()
        jwt_secret = jwt_secret or dev["jwt_secret"]
        credentials_key_b64 = credentials_key_b64 or dev["credentials_key"]
    credentials_key = base64.b64decode(credentials_key_b64)
    if len(credentials_key) != 32:
        raise RuntimeError("CREDENTIALS_KEY must be 32 bytes, base64-encoded")

    default_db = f"sqlite:///{DATA_DIR / 'diabeteasy.db'}"
    return Settings(
        app_env=app_env,
        database_url=normalize_database_url(_env("DATABASE_URL", default_db)),
        jwt_secret=jwt_secret,
        credentials_key=credentials_key,
        access_token_minutes=int(_env("ACCESS_TOKEN_MINUTES", "15")),
        refresh_token_days=int(_env("REFRESH_TOKEN_DAYS", "30")),
        cookie_secure=_bool("COOKIE_SECURE", app_env == "production"),
        apple_client_ids=_list("APPLE_CLIENT_IDS"),
        google_client_ids=_list("GOOGLE_CLIENT_IDS"),
        apple_team_id=_env("APPLE_TEAM_ID"),
        apple_key_id=_env("APPLE_KEY_ID"),
        apple_private_key=_env("APPLE_PRIVATE_KEY").replace("\\n", "\n"),
        storage_backend=_env("STORAGE_BACKEND", "local").lower(),
        s3_bucket=_env("S3_BUCKET"),
        s3_endpoint_url=_env("S3_ENDPOINT_URL"),
        aws_region=_env("AWS_REGION", "us-east-1"),
        local_storage_dir=_env("LOCAL_STORAGE_DIR", str(DATA_DIR / "uploads")),
        email_backend=_env("EMAIL_BACKEND", "console").lower(),
        email_from=_env("EMAIL_FROM", "DiabetEasy <insights@diabeteasy.com>"),
        smtp_host=_env("SMTP_HOST"),
        smtp_port=int(_env("SMTP_PORT", "587")),
        smtp_user=_env("SMTP_USER"),
        smtp_password=_env("SMTP_PASSWORD"),
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        anthropic_model=_env("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
        ai_timeout_seconds=float(_env("AI_TIMEOUT_SECONDS", "60")),
        ai_daily_limit=int(_env("AI_DAILY_LIMIT", "20")),
        fitbit_client_id=_env("FITBIT_CLIENT_ID"),
        fitbit_client_secret=_env("FITBIT_CLIENT_SECRET"),
        fitbit_redirect_uri=_env("FITBIT_REDIRECT_URI", "https://diabeteasy.com/integrations/fitbit/callback"),
        dexcom_client_id=_env("DEXCOM_CLIENT_ID"),
        dexcom_client_secret=_env("DEXCOM_CLIENT_SECRET"),
        dexcom_base_url=_env("DEXCOM_BASE_URL", "https://sandbox-api.dexcom.com").rstrip("/"),
        dexcom_redirect_uris=_list("DEXCOM_REDIRECT_URIS") or [
            "https://diabeteasy.com/dexcom/callback", "https://diabeteasy.com/app/dexcom/callback"],
        auth_rate_limit_per_minute=int(_env("AUTH_RATE_LIMIT_PER_MINUTE", "30")),
        client_ip_header=_env("CLIENT_IP_HEADER").lower(),
    )


@lru_cache
def get_settings() -> Settings:
    return load_settings()
