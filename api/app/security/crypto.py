"""AES-GCM encryption for stored third-party credentials (Libre password, Fitbit and Apple tokens).

The 32-byte key comes from CREDENTIALS_KEY (base64), injected from AWS Secrets Manager in production.

Phase 1b: an optional ``aad`` (associated data) binds a ciphertext to its column and user, e.g.
``user_profile.libre_password_enc:<user_id>``. A ciphertext copied to another row or user then
fails to decrypt. Calls without ``aad`` (Phase 1a, Apple token) behave exactly as before.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

_PREFIX = "v1:"


def column_aad(table: str, column: str, user_id: str) -> str:
    """Associated data that binds a ciphertext to one column of one user's row."""
    return f"{table}.{column}:{user_id}"


def _aad(aad: str | None) -> bytes | None:
    return aad.encode("utf-8") if aad else None


def encrypt(plaintext: str | None, aad: str | None = None) -> str | None:
    if plaintext is None:
        return None
    nonce = os.urandom(12)
    ciphertext = AESGCM(get_settings().credentials_key).encrypt(nonce, plaintext.encode("utf-8"), _aad(aad))
    return _PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def profile_aad(profile, column: str) -> str:
    """Associated data for an encrypted user_profile column."""
    return column_aad("user_profile", column, str(profile.user_id))


def decrypt_column(token: str | None, aad: str) -> str | None:
    """Decrypt a column bound with ``aad``. Ciphertexts written before binding existed (no
    associated data, e.g. from the Base44 copy script) are still accepted; a ciphertext bound to
    another column or user fails both attempts and raises InvalidTag."""
    from cryptography.exceptions import InvalidTag

    try:
        return decrypt(token, aad)
    except InvalidTag:
        return decrypt(token, None)


def decrypt(token: str | None, aad: str | None = None) -> str | None:
    if not token:
        return None
    if not token.startswith(_PREFIX):
        raise ValueError("Unknown ciphertext format")
    raw = base64.urlsafe_b64decode(token[len(_PREFIX):])
    return AESGCM(get_settings().credentials_key).decrypt(raw[:12], raw[12:], _aad(aad)).decode("utf-8")
