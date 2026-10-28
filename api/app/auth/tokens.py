"""The API's own JWTs: 15-minute access tokens and 30-day refresh tokens (HS256).

Both carry the user's token_version (`tv`); bumping it on logout or account
deletion invalidates every token issued before.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings
from app.models import User

ISSUER = "diabeteasy-api"


class TokenError(Exception):
    pass


def _issue(user: User, token_type: str, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": ISSUER,
        "sub": user.id,
        "tv": user.token_version,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def issue_access_token(user: User) -> str:
    return _issue(user, "access", timedelta(minutes=get_settings().access_token_minutes))


def issue_refresh_token(user: User) -> str:
    return _issue(user, "refresh", timedelta(days=get_settings().refresh_token_days))


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=["HS256"],
            issuer=ISSUER,
            options={"require": ["exp", "sub", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != expected_type:
        raise TokenError("Wrong token type")
    return payload
