"""Phase 4: return URL for Sign in with Apple running in an Android Custom Tab.

Apple posts its form (response_mode=form_post) here. This endpoint signs no one in and stores
nothing: it only bounces the fields to the fixed, verified App Link in the URL fragment. There is
never a caller-chosen redirect target, so it cannot act as an open redirect.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from app.ratelimit import check_auth_rate

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

APP_LINK = "https://diabeteasy.com/app/apple-callback"
MAX_ID_TOKEN = 4096
MAX_CODE = 1024
MAX_NAME = 200
_STATE = re.compile(r"^[A-Za-z0-9_\-.~]{1,128}$")
_ERROR = re.compile(r"^[a-z_]{1,64}$")


def _redirect(fields: dict[str, str]) -> RedirectResponse:
    response = RedirectResponse(f"{APP_LINK}#{urlencode(fields)}", status_code=303)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def _full_name(raw: str) -> str | None:
    """Apple sends user={"name":{"firstName":..,"lastName":..}} on the first sign-in only."""
    if not raw or len(raw) > 2048:
        return None
    try:
        name = json.loads(raw).get("name") or {}
        full = " ".join(p for p in (name.get("firstName"), name.get("lastName")) if isinstance(p, str) and p).strip()
    except (ValueError, AttributeError):
        return None
    return full[:MAX_NAME] or None


def bounce(form: dict[str, str]) -> RedirectResponse:
    error = form.get("error", "")
    if error:
        return _redirect({"error": error if _ERROR.match(error) else "invalid_response"})
    code, id_token, state = form.get("code", ""), form.get("id_token", ""), form.get("state", "")
    if not (0 < len(code) <= MAX_CODE and 0 < len(id_token) <= MAX_ID_TOKEN and _STATE.match(state)):
        return _redirect({"error": "invalid_response"})
    fields = {"code": code, "id_token": id_token, "state": state}
    name = _full_name(form.get("user", ""))
    if name:
        fields["name"] = name
    return _redirect(fields)


@router.post("/apple/callback-android", status_code=303, dependencies=[Depends(check_auth_rate)],
             response_class=RedirectResponse)
async def apple_callback_android(request: Request) -> RedirectResponse:
    """Apple form_post target for Android; responds 303 to the fixed App Link with fields in the fragment."""
    try:
        form = await request.form()
        values = {k: v for k, v in form.items() if isinstance(v, str)}
    except Exception:
        values = {}
    return bounce(values)
