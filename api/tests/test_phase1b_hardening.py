"""Phase 1b design gates: credential binding, atomic AI quota, deletion order, production settings."""

from __future__ import annotations

import pytest
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException

from app.config import get_settings, load_settings
from app.db import new_session
from app.models import User
from app.ratelimit import consume_ai_quota, seconds_until_utc_midnight
from app.security.crypto import column_aad, decrypt_column, encrypt
from tests.conftest import headers_for


def test_bound_ciphertext_fails_for_another_user_but_legacy_still_decrypts():
    aad_a = column_aad("user_profile", "libre_password_enc", "user-a")
    aad_b = column_aad("user_profile", "libre_password_enc", "user-b")
    token = encrypt("s3cret", aad_a)
    assert decrypt_column(token, aad_a) == "s3cret"
    with pytest.raises(InvalidTag):
        decrypt_column(token, aad_b)
    with pytest.raises(InvalidTag):
        decrypt_column(token, column_aad("user_profile", "fitbit_access_token_enc", "user-a"))
    # Ciphertexts written without associated data (copy script, Phase 1a) remain readable.
    assert decrypt_column(encrypt("legacy"), aad_a) == "legacy"


def test_ai_quota_is_atomic_and_sets_retry_after(alice):
    limit = get_settings().ai_daily_limit
    with new_session() as db:
        user = db.get(User, alice.id)
        for _ in range(limit):
            consume_ai_quota(db, user)
        with pytest.raises(HTTPException) as exc:
            consume_ai_quota(db, user)
        assert exc.value.status_code == 429
        assert 0 < int(exc.value.headers["Retry-After"]) <= 86400
        assert db.get(User, alice.id).ai_calls_count == limit
    assert 0 < seconds_until_utc_midnight() <= 86400


def test_delete_account_keeps_everything_when_file_cleanup_fails(client, alice, monkeypatch):
    class BrokenStorage:
        def delete_prefix(self, prefix):
            raise ConnectionError("storage down")

    monkeypatch.setattr("app.routers.me.get_storage", lambda: BrokenStorage())
    resp = client.delete("/api/v1/me", headers=headers_for(alice))
    assert resp.status_code == 503
    assert resp.json() == {"error": "storage_unavailable", "retryable": True}
    assert client.get("/api/v1/me", headers=headers_for(alice)).status_code == 200


def test_production_requires_storage_ai_and_real_email(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    monkeypatch.setenv("CREDENTIALS_KEY", "A" * 43 + "=")
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("EMAIL_BACKEND", "console")
    with pytest.raises(RuntimeError) as exc:
        load_settings()
    message = str(exc.value)
    assert "S3_BUCKET" in message and "ANTHROPIC_API_KEY" in message and "EMAIL_BACKEND" in message
    assert "x" * 40 not in message
