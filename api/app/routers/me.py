"""GET and DELETE /api/v1/me."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.integrations import apple, fitbit
from app.integrations.profile import get_profile
from app.models import User
from app.storage import get_storage

log = logging.getLogger("diabeteasy.account")
router = APIRouter(prefix="/api/v1/me", tags=["account"])


class MeOut(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    providers: list[str]
    integrations_available: list[str] = []


# Device integrations this server can always serve. 'dexcom' is added when DEXCOM_CLIENT_ID is set;
# until then clients keep the simulated Dexcom tile.
INTEGRATIONS_AVAILABLE = ("libre", "fitbit")


def integrations_available() -> list[str]:
    from app.integrations import dexcom

    return list(INTEGRATIONS_AVAILABLE) + (["dexcom"] if dexcom.configured() else [])


def me_payload(user: User) -> MeOut:
    providers = [p for p, sub in (("apple", user.apple_sub), ("google", user.google_sub)) if sub]
    return MeOut(id=user.id, email=user.email, full_name=user.full_name, providers=providers,
                 integrations_available=integrations_available())


@router.get("", response_model=MeOut)
def get_me(user: User = Depends(current_user)) -> MeOut:
    """The signed-in user (replaces base44.auth.me())."""
    return me_payload(user)


@router.delete("", status_code=204)
def delete_me(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    """Delete the account in the designed order: (1) every stored file version under users/{id}/
    (must succeed, otherwise 503 retryable and nothing else is deleted); (2) Fitbit revocation and
    (3) Apple revocation, both best effort; (4) the user row, which cascades to all 10 tables."""
    try:
        get_storage().delete_prefix(f"users/{user.id}/")
    except Exception as exc:
        log.warning("File cleanup failed for user %s, account kept: %s", user.id, type(exc).__name__)
        return JSONResponse(status_code=503, content={"error": "storage_unavailable", "retryable": True})
    profile = get_profile(db, user)
    if profile is not None and profile.fitbit_access_token_enc:
        try:
            fitbit.revoke(profile)
        except Exception as exc:
            log.warning("Fitbit token revocation failed for user %s: %s", user.id, type(exc).__name__)
    if user.apple_refresh_token_enc:
        try:
            apple.revoke(user.apple_refresh_token_enc)
        except Exception as exc:
            log.warning("Apple token revocation failed for user %s: %s", user.id, exc)
    get_storage().delete_prefix(f"users/{user.id}/")
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    return Response(status_code=204)
