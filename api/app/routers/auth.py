"""POST /api/v1/auth/{apple|google|refresh|logout}."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.idtoken import InvalidIdToken, ProviderUnavailable, verify_id_token
from app.auth.tokens import TokenError, decode_token, issue_access_token, issue_refresh_token
from app.config import get_settings
from app.db import get_db
from app.integrations import apple
from app.models import User, utcnow
from app.ratelimit import check_auth_rate
from app.routers.me import MeOut, me_payload

log = logging.getLogger("diabeteasy.auth")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REFRESH_COOKIE = "dz_refresh"
COOKIE_PATH = "/api/v1/auth"


class SignInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_token: str = Field(min_length=10)
    authorization_code: str | None = None
    full_name: str | None = Field(None, max_length=200)
    nonce: str | None = None
    client: Literal["web", "ios"] = "web"


class RefreshBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    user: MeOut


def _token_response(db: Session, user: User, client: str, response: Response) -> TokenOut:
    s = get_settings()
    refresh = issue_refresh_token(user)
    if client == "web":
        response.set_cookie(
            REFRESH_COOKIE, refresh, max_age=s.refresh_token_days * 86400, path=COOKIE_PATH,
            httponly=True, secure=s.cookie_secure, samesite="strict",
        )
    return TokenOut(
        access_token=issue_access_token(user),
        expires_in=s.access_token_minutes * 60,
        refresh_token=refresh if client == "ios" else None,
        user=me_payload(user),
    )


def _sign_in(provider: Literal["apple", "google"], body: SignInBody, response: Response, db: Session) -> TokenOut:
    s = get_settings()
    audiences = s.apple_client_ids if provider == "apple" else s.google_client_ids
    try:
        identity = verify_id_token(provider, body.id_token, audiences, body.nonce)
    except InvalidIdToken:
        raise HTTPException(status_code=401, detail="Invalid ID token") from None
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None

    sub_column = User.apple_sub if provider == "apple" else User.google_sub
    sub_attr = "apple_sub" if provider == "apple" else "google_sub"
    user = db.scalar(select(User).where(sub_column == identity.sub))
    if user is None and identity.email:
        by_email = db.scalar(select(User).where(User.email == identity.email))
        if by_email is not None:
            # Link only by a verified email, and never take over another identity of the same provider.
            if not identity.email_verified or getattr(by_email, sub_attr):
                raise HTTPException(status_code=409, detail="An account with this email already exists")
            user = by_email
    if user is None:
        if not identity.email:
            raise HTTPException(status_code=400, detail="The sign-in provider did not share an email address")
        user = User(email=identity.email)
        db.add(user)
    setattr(user, sub_attr, identity.sub)
    if not user.full_name:
        user.full_name = body.full_name or identity.name
    user.last_login_at = utcnow()

    if provider == "apple" and body.authorization_code and apple.configured():
        try:
            blob = apple.exchange_code(body.authorization_code, identity.audience)
            if blob:
                user.apple_refresh_token_enc = blob
        except Exception as exc:  # sign-in still succeeds; only later revocation is affected
            log.warning("Apple code exchange failed: %s", exc)
    db.commit()
    return _token_response(db, user, body.client, response)


@router.post("/apple", response_model=TokenOut, dependencies=[Depends(check_auth_rate)])
def sign_in_apple(body: SignInBody, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    """Verify a Sign in with Apple ID token, find/create/link the user and issue API tokens."""
    return _sign_in("apple", body, response, db)


@router.post("/google", response_model=TokenOut, dependencies=[Depends(check_auth_rate)])
def sign_in_google(body: SignInBody, response: Response, db: Session = Depends(get_db)) -> TokenOut:
    """Verify a Google ID token, find/create/link the user and issue API tokens."""
    return _sign_in("google", body, response, db)


@router.post("/refresh", response_model=TokenOut, response_model_exclude_none=True,
             dependencies=[Depends(check_auth_rate)])
def refresh(request: Request, body: RefreshBody | None = None, db: Session = Depends(get_db)) -> TokenOut:
    """Issue a new access token from the refresh token (body on iOS, httpOnly cookie on the web)."""
    token = body.refresh_token if body else None
    if not token:
        token = request.cookies.get(REFRESH_COOKIE)
        # Cookie refresh needs a header a cross-site form cannot set (CSRF defence next to SameSite=Strict).
        if token and not request.headers.get("X-Requested-With"):
            raise HTTPException(status_code=403, detail="X-Requested-With header is required for cookie refresh")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token, "refresh")
    except TokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token") from None
    user = db.get(User, payload["sub"])
    if user is None or user.token_version != payload.get("tv"):
        raise HTTPException(status_code=401, detail="Session has ended, sign in again")
    return TokenOut(
        access_token=issue_access_token(user),
        expires_in=get_settings().access_token_minutes * 60,
        user=me_payload(user),
    )


@router.post("/logout", status_code=204)
def logout(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    """End all sessions of the user: bumps token_version so every issued token stops working."""
    user.token_version += 1
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response
