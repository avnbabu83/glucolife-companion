"""Sign in with Apple server calls: exchange the authorization code for a refresh
token (kept encrypted) and revoke it when the account is deleted (App Store rule 5.1.1(v))."""

from __future__ import annotations

import json
import logging
import time

import jwt

from app import http
from app.config import get_settings
from app.security.crypto import decrypt, encrypt

log = logging.getLogger("diabeteasy.apple")

TOKEN_URL = "https://appleid.apple.com/auth/token"
REVOKE_URL = "https://appleid.apple.com/auth/revoke"


def configured() -> bool:
    s = get_settings()
    return bool(s.apple_team_id and s.apple_key_id and s.apple_private_key)


def client_secret(client_id: str) -> str:
    s = get_settings()
    now = int(time.time())
    claims = {"iss": s.apple_team_id, "iat": now, "exp": now + 300, "aud": "https://appleid.apple.com", "sub": client_id}
    return jwt.encode(claims, s.apple_private_key, algorithm="ES256", headers={"kid": s.apple_key_id})


def exchange_code(code: str, client_id: str) -> str | None:
    """Return the encrypted {client_id, refresh_token} blob, or None if Apple gave no refresh token."""
    with http.client(timeout=15) as c:
        resp = c.post(
            TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret(client_id),
                "code": code,
                "grant_type": "authorization_code",
            },
        )
    resp.raise_for_status()
    refresh_token = resp.json().get("refresh_token")
    if not refresh_token:
        return None
    return encrypt(json.dumps({"client_id": client_id, "refresh_token": refresh_token}))


def revoke(blob_enc: str) -> bool:
    if not configured():
        log.warning("Apple revocation skipped: APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY not set")
        return False
    data = json.loads(decrypt(blob_enc) or "{}")
    client_id, token = data.get("client_id"), data.get("refresh_token")
    if not client_id or not token:
        return False
    with http.client(timeout=15) as c:
        resp = c.post(
            REVOKE_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret(client_id),
                "token": token,
                "token_type_hint": "refresh_token",
            },
        )
    return resp.status_code == 200
