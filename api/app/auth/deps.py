"""FastAPI dependency that resolves the signed-in user from the Bearer access token."""

from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.tokens import TokenError, decode_token
from app.db import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Not signed in") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise _unauthorized()
    try:
        payload = decode_token(creds.credentials, "access")
    except TokenError:
        raise _unauthorized("Invalid or expired access token") from None
    user = db.get(User, payload["sub"])
    if user is None or user.token_version != payload.get("tv"):
        raise _unauthorized("Session has ended, sign in again")
    return user
