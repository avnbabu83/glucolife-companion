"""Fitbit Web API with per-user OAuth tokens, ported from base44/functions/syncFitbitData.

Fetches the same three endpoints as today (sleep, activity summary, heart rate)
for today's date and upserts SleepLog and ActivityData. Expired access tokens
are refreshed automatically; if that fails, the tokens are cleared and the
client is asked to reconnect with { needsAuth: true }.
"""

from __future__ import annotations

import base64
import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import http
from app.config import get_settings
from app.integrations.profile import get_or_create_profile, get_profile
from app.models import ActivityData, SleepLog, User, UserProfile, as_utc
from app.security.crypto import decrypt, encrypt

log = logging.getLogger("diabeteasy.fitbit")

TOKEN_URL = "https://api.fitbit.com/oauth2/token"
REVOKE_URL = "https://api.fitbit.com/oauth2/revoke"
API = "https://api.fitbit.com"
SOURCE = "fitbit"


class FitbitAuthError(Exception):
    pass


def configured() -> bool:
    s = get_settings()
    return bool(s.fitbit_client_id and s.fitbit_client_secret)


def _basic_auth() -> str:
    s = get_settings()
    raw = f"{s.fitbit_client_id}:{s.fitbit_client_secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _token_request(data: dict) -> dict:
    with http.client(timeout=15) as c:
        resp = c.post(TOKEN_URL, data=data, headers={"Authorization": _basic_auth()})
    if resp.status_code != 200:
        raise FitbitAuthError(f"Fitbit token request failed ({resp.status_code})")
    return resp.json()


def _store_tokens(profile: UserProfile, tokens: dict) -> None:
    profile.fitbit_access_token_enc = encrypt(tokens["access_token"])
    if tokens.get("refresh_token"):
        profile.fitbit_refresh_token_enc = encrypt(tokens["refresh_token"])
    profile.fitbit_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 28800)))


def _clear_tokens(profile: UserProfile) -> None:
    profile.fitbit_access_token_enc = None
    profile.fitbit_refresh_token_enc = None
    profile.fitbit_token_expires_at = None


def _refresh(db: Session, profile: UserProfile) -> str:
    refresh_token = decrypt(profile.fitbit_refresh_token_enc)
    try:
        if not refresh_token:
            raise FitbitAuthError("No refresh token")
        tokens = _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
    except (FitbitAuthError, httpx.HTTPError) as exc:
        _clear_tokens(profile)
        db.commit()
        raise FitbitAuthError("Fitbit session expired") from exc
    _store_tokens(profile, tokens)
    db.commit()
    return tokens["access_token"]


def _access_token(db: Session, profile: UserProfile) -> str | None:
    if not profile.fitbit_access_token_enc:
        return None
    expires = as_utc(profile.fitbit_token_expires_at)
    if expires is not None and expires <= datetime.now(timezone.utc) + timedelta(seconds=60):
        return _refresh(db, profile)
    return decrypt(profile.fitbit_access_token_enc)


def connect(db: Session, user: User, code: str, redirect_uri: str | None, code_verifier: str | None) -> tuple[int, dict]:
    if not configured():
        return 503, {"error": "Fitbit is not configured on this server (FITBIT_CLIENT_ID/FITBIT_CLIENT_SECRET)"}
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri or get_settings().fitbit_redirect_uri,
        "client_id": get_settings().fitbit_client_id,
    }
    if code_verifier:
        data["code_verifier"] = code_verifier
    try:
        tokens = _token_request(data)
    except (FitbitAuthError, httpx.HTTPError):
        return 401, {"needsAuth": True, "error": "Fitbit rejected the authorization code, please try connecting again"}
    profile = get_or_create_profile(db, user)
    _store_tokens(profile, tokens)
    db.commit()
    return 200, {"success": True, "message": "Fitbit connected successfully"}


def _fetch(token: str, day: str) -> dict[str, httpx.Response]:
    headers = {"Authorization": f"Bearer {token}"}
    with http.client() as c:
        return {
            "sleep": c.get(f"{API}/1.2/user/-/sleep/date/{day}.json", headers=headers),
            "activity": c.get(f"{API}/1/user/-/activities/date/{day}.json", headers=headers),
            "heartRate": c.get(f"{API}/1/user/-/activities/heart/date/{day}/1d.json", headers=headers),
        }


def _quality(efficiency: float) -> str:
    if efficiency >= 90:
        return "excellent"
    if efficiency >= 80:
        return "good"
    if efficiency >= 70:
        return "fair"
    return "poor"


def sync(db: Session, user: User, today: date | None = None) -> tuple[int, dict]:
    profile = get_profile(db, user)
    try:
        token = _access_token(db, profile) if profile else None
        if not token:
            return 400, {"needsAuth": True, "error": "Please connect your Fitbit account first"}
        day = (today or datetime.now(timezone.utc).date()).isoformat()
        responses = _fetch(token, day)
        if any(r.status_code == 401 for r in responses.values()):
            responses = _fetch(_refresh(db, profile), day)
            if any(r.status_code == 401 for r in responses.values()):
                _clear_tokens(profile)
                db.commit()
                raise FitbitAuthError("Fitbit rejected the token")
    except FitbitAuthError:
        return 401, {"needsAuth": True, "error": "Please reconnect your Fitbit account"}
    except httpx.HTTPError as exc:
        log.warning("Fitbit sync failed for user %s: %s", user.id, exc)
        return 502, {"error": "Failed to fetch data from Fitbit"}

    if any(r.status_code != 200 for r in responses.values()):
        return 502, {
            "error": "Failed to fetch data from Fitbit",
            "sleepStatus": responses["sleep"].status_code,
            "activityStatus": responses["activity"].status_code,
            "heartRateStatus": responses["heartRate"].status_code,
        }
    sleep_data = responses["sleep"].json()
    activity_data = responses["activity"].json()
    heart_data = responses["heartRate"].json()
    day_date = date.fromisoformat(day)
    synced = 0
    extra = dict(profile.extra or {})

    sleeps = sleep_data.get("sleep") or []
    if sleeps:
        main = next((s for s in sleeps if s.get("isMainSleep")), sleeps[0])
        external_id = str(main.get("logId") or day)
        total_minutes = (main.get("duration") or 0) / 60000
        exists = db.scalar(select(SleepLog.id).where(
            SleepLog.user_id == user.id, SleepLog.source == SOURCE, SleepLog.external_id == external_id
        ))
        if not exists:
            summary = (main.get("levels") or {}).get("summary") or {}
            db.add(SleepLog(
                user_id=user.id,
                date=day_date,
                sleep_start_time=main.get("startTime"),
                sleep_end_time=main.get("endTime"),
                bedtime=(main.get("startTime") or "T00:00").split("T")[1][:5],
                wake_time=(main.get("endTime") or "T00:00").split("T")[1][:5],
                total_hours=round(total_minutes / 60, 1),
                duration_minutes=round(total_minutes),
                quality=_quality(main.get("efficiency") or 0),
                source=SOURCE,
                external_id=external_id,
                extra={
                    "deep_sleep_minutes": (summary.get("deep") or {}).get("minutes", 0),
                    "rem_sleep_minutes": (summary.get("rem") or {}).get("minutes", 0),
                    "light_sleep_minutes": (summary.get("light") or {}).get("minutes", 0),
                    "interruptions": (summary.get("wake") or {}).get("count", 0),
                },
            ))
            synced += 1
        extra["last_sleep_hours"] = round(total_minutes / 60, 1)

    summary = activity_data.get("summary") or {}
    steps = summary.get("steps") or 0
    calories = summary.get("caloriesOut") or 0
    active_minutes = (summary.get("veryActiveMinutes") or 0) + (summary.get("fairlyActiveMinutes") or 0)
    hr = ((heart_data.get("activities-heart") or [{}])[0].get("value") or {}).get("restingHeartRate") or 0

    activity = db.scalar(select(ActivityData).where(
        ActivityData.user_id == user.id, ActivityData.source == SOURCE, ActivityData.date == day_date
    ))
    if activity is None:
        activity = ActivityData(user_id=user.id, date=day_date, source=SOURCE)
        db.add(activity)
    activity.steps = steps
    activity.calories = calories
    activity.active_minutes = active_minutes
    activity.resting_heart_rate = hr
    synced += 1

    extra.update({"last_steps": steps, "last_calories": calories, "last_heart_rate": hr})
    profile.extra = extra
    db.commit()
    return 200, {
        "success": True,
        "synced": synced,
        "data": {"sleep": len(sleeps), "steps": steps, "calories": calories, "heartRate": hr},
    }


def revoke(profile: UserProfile) -> None:
    """Best-effort revocation at Fitbit (used on disconnect and account deletion)."""
    token = decrypt(profile.fitbit_refresh_token_enc) or decrypt(profile.fitbit_access_token_enc)
    if not token or not configured():
        return
    try:
        with http.client(timeout=15) as c:
            c.post(REVOKE_URL, data={"token": token}, headers={"Authorization": _basic_auth()})
    except httpx.HTTPError as exc:
        log.warning("Fitbit revoke failed: %s", exc)


def disconnect(db: Session, user: User) -> tuple[int, dict]:
    profile = get_profile(db, user)
    if profile and profile.fitbit_access_token_enc:
        revoke(profile)
        _clear_tokens(profile)
        db.commit()
    return 200, {"success": True, "message": "Fitbit disconnected"}
