"""POST /api/v1/integrations/{libre|fitbit}/{connect|sync|disconnect}."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.integrations import dexcom, fitbit, libre
from app.models import User

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


class LibreConnectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class FitbitConnectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1)
    redirect_uri: str | None = None
    code_verifier: str | None = None


class DexcomConnectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    redirect_uri: str = Field(min_length=1, max_length=300)
    code: str | None = Field(default=None, min_length=1, max_length=2000)
    state: str | None = Field(default=None, min_length=1, max_length=2000)


def _parse(model: type[BaseModel], body: dict[str, Any]) -> Any:
    try:
        return model.model_validate(body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False)) from None


@router.post("/{provider}/{action}", summary="Connect, sync or disconnect FreeStyle Libre (LibreLinkUp) or Fitbit")
def integration_action(
    provider: str,
    action: str,
    body: dict[str, Any] = Body(default_factory=dict),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if provider == "libre":
        if action == "connect":
            data = _parse(LibreConnectIn, body)
            status, payload = libre.connect(db, user, data.email, data.password)
        elif action == "sync":
            status, payload = libre.sync(db, user)
        elif action == "disconnect":
            status, payload = libre.disconnect(db, user)
        else:
            raise HTTPException(status_code=404, detail="Unknown action")
    elif provider == "fitbit":
        if action == "connect":
            data = _parse(FitbitConnectIn, body)
            status, payload = fitbit.connect(db, user, data.code, data.redirect_uri, data.code_verifier)
        elif action == "sync":
            status, payload = fitbit.sync(db, user)
        elif action == "disconnect":
            status, payload = fitbit.disconnect(db, user)
        else:
            raise HTTPException(status_code=404, detail="Unknown action")
    elif provider == "dexcom":
        if action == "connect":
            data = _parse(DexcomConnectIn, body)
            status, payload = dexcom.connect(db, user, data.redirect_uri, data.code, data.state)
        elif action == "sync":
            status, payload = dexcom.sync(db, user)
        elif action == "disconnect":
            status, payload = dexcom.disconnect(db, user)
        else:
            raise HTTPException(status_code=404, detail="Unknown action")
    else:
        raise HTTPException(status_code=404, detail="Unknown provider")
    return JSONResponse(status_code=status, content=payload)
