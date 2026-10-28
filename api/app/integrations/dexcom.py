"""Dexcom API v3 (official OAuth 2.0) — Phase 4a.

connect { redirect_uri } returns an authorize_url with a sealed, 10-minute state bound to the user and
the redirect_uri. connect { code, state, redirect_uri } exchanges the code (client secret held by the
server) and stores AES-GCM encrypted tokens. sync imports EGVs as GlucoseReading rows with
source_device 'dexcom' and external_id = recordId; duplicates are skipped by the unique
(user_id, source_device, external_id) constraint. Dexcom refresh tokens are single-use, so the rotated
refresh token is always stored. Only counts are logged.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import http
from app.config import get_settings
from app.integrations.profile import get_or_create_profile, get_profile
from app.models import GlucoseReading, User, UserProfile, as_utc
from app.security.crypto import decrypt, decrypt_column, encrypt, profile_aad

log = logging.getLogger("diabeteasy.dexcom")

SOURCE = "dexcom"
STATE_TTL_SECONDS = 600
WINDOW = timedelta(days=30)
FIRST_SYNC = timedelta(days=30)
OVERLAP = timedelta(hours=1)
MMOL_TO_MGDL = 18.0182
NOT_CONFIGURED = (503, {"error": "dexcom_not_configured"})
NEEDS_AUTH = (400, {"needsAuth": True, "error": "Please connect your Dexcom account"})
UPSTREAM = (502, {"error": "dexcom_unavailable", "message": "Dexcom unavailable, try later"})


class DexcomAuthError(Exception):
    """Tokens missing, revoked or already used: the user must connect again."""


class DexcomUpstreamError(Exception):
    """Dexcom answered with a server error or could not be reached."""


def configured() -> bool:
    return bool(get_settings().dexcom_client_id)


def _base() -> str:
    return get_settings().dexcom_base_url


# --- sealed state ---------------------------------------------------------------------------------

def seal_state(user_id: str, redirect_uri: str, now: float | None = None) -> str:
    exp = int((now if now is not None else time.time()) + STATE_TTL_SECONDS)
    return encrypt(json.dumps({"u": user_id, "r": redirect_uri, "exp": exp}), aad="dexcom_state")


def state_valid(state: str, user_id: str, redirect_uri: str) -> bool:
    try:
        data = json.loads(decrypt(state, aad="dexcom_state") or "{}")
    except Exception:
        return False
    return data.get("u") == user_id and data.get("r") == redirect_uri and int(data.get("exp", 0)) >= time.time()


# --- tokens ---------------------------------------------------------------------------------------

def _token_request(data: dict) -> dict:
    s = get_settings()
    payload = {"client_id": s.dexcom_client_id, "client_secret": s.dexcom_client_secret, **data}
    try:
        with http.client(timeout=15) as c:
            resp = c.post(f"{_base()}/v2/oauth2/token", data=payload)
    except httpx.HTTPError as exc:
        raise DexcomUpstreamError(type(exc).__name__) from exc
    if resp.status_code >= 500:
        raise DexcomUpstreamError(f"token {resp.status_code}")
    if resp.status_code != 200:
        raise DexcomAuthError(f"token {resp.status_code}")
    return resp.json()


def _store_tokens(profile: UserProfile, tokens: dict) -> None:
    profile.dexcom_access_token_enc = encrypt(tokens["access_token"], profile_aad(profile, "dexcom_access_token_enc"))
    if tokens.get("refresh_token"):
        profile.dexcom_refresh_token_enc = encrypt(
            tokens["refresh_token"], profile_aad(profile, "dexcom_refresh_token_enc"))
    profile.dexcom_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 7200)))


def _clear_tokens(profile: UserProfile) -> None:
    profile.dexcom_access_token_enc = None
    profile.dexcom_refresh_token_enc = None
    profile.dexcom_token_expires_at = None
    profile.dexcom_last_sync_at = None


def _refresh(db: Session, profile: UserProfile) -> str:
    refresh_token = decrypt_column(profile.dexcom_refresh_token_enc, profile_aad(profile, "dexcom_refresh_token_enc"))
    if not refresh_token:
        raise DexcomAuthError("no refresh token")
    try:
        tokens = _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
    except DexcomAuthError:
        _clear_tokens(profile)
        db.commit()
        raise
    _store_tokens(profile, tokens)
    db.commit()
    return tokens["access_token"]


def _access_token(db: Session, profile: UserProfile) -> str:
    if not (profile.dexcom_access_token_enc or profile.dexcom_refresh_token_enc):
        raise DexcomAuthError("not connected")
    expires = as_utc(profile.dexcom_token_expires_at)
    if not profile.dexcom_access_token_enc or (
            expires is not None and expires <= datetime.now(timezone.utc) + timedelta(seconds=60)):
        return _refresh(db, profile)
    return decrypt_column(profile.dexcom_access_token_enc, profile_aad(profile, "dexcom_access_token_enc"))


# --- actions --------------------------------------------------------------------------------------

def connect(db: Session, user: User, redirect_uri: str, code: str | None, state: str | None) -> tuple[int, dict]:
    if not configured():
        return NOT_CONFIGURED
    s = get_settings()
    if redirect_uri not in s.dexcom_redirect_uris:
        return 400, {"error": "redirect_uri_not_allowed"}
    if not code:
        query = urlencode({"client_id": s.dexcom_client_id, "redirect_uri": redirect_uri, "response_type": "code",
                           "scope": "offline_access", "state": seal_state(user.id, redirect_uri)})
        return 200, {"authorize_url": f"{_base()}/v2/oauth2/login?{query}"}
    if not state or not state_valid(state, user.id, redirect_uri):
        return 400, {"error": "invalid_state", "message": "Dexcom not connected"}
    try:
        tokens = _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri})
    except DexcomAuthError:
        return NEEDS_AUTH
    except DexcomUpstreamError:
        return UPSTREAM
    profile = get_or_create_profile(db, user)
    _store_tokens(profile, tokens)
    db.commit()
    return 200, {"success": True}


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _reading(record: dict) -> float | None:
    value = record.get("value")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if str(record.get("unit") or "mg/dL").lower().startswith("mmol"):
        value = value * MMOL_TO_MGDL
    value = round(float(value), 1)
    return value if 20 <= value <= 600 else None


def _fetch_egvs(db: Session, profile: UserProfile, token: str, start: datetime, end: datetime) -> tuple[str, list]:
    fmt = "%Y-%m-%dT%H:%M:%S"
    params = {"startDate": start.strftime(fmt), "endDate": end.strftime(fmt)}
    for attempt in range(2):
        try:
            with http.client(timeout=30) as c:
                resp = c.get(f"{_base()}/v3/users/self/egvs", params=params,
                             headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError as exc:
            raise DexcomUpstreamError(type(exc).__name__) from exc
        if resp.status_code == 401 and attempt == 0:
            token = _refresh(db, profile)
            continue
        if resp.status_code == 401:
            _clear_tokens(profile)
            db.commit()
            raise DexcomAuthError("egvs 401")
        if resp.status_code != 200:
            raise DexcomUpstreamError(f"egvs {resp.status_code}")
        return token, (resp.json() or {}).get("records") or []
    raise DexcomAuthError("unreachable")


def sync(db: Session, user: User, now: datetime | None = None) -> tuple[int, dict]:
    if not configured():
        return NOT_CONFIGURED
    profile = get_profile(db, user)
    if profile is None:
        return NEEDS_AUTH
    now = now or datetime.now(timezone.utc)
    last = as_utc(profile.dexcom_last_sync_at)
    start = max(last - OVERLAP, now - FIRST_SYNC) if last else now - FIRST_SYNC
    records: list[dict] = []
    try:
        token = _access_token(db, profile)
        while start < now:
            end = min(start + WINDOW, now)
            token, batch = _fetch_egvs(db, profile, token, start, end)
            records.extend(batch)
            start = end
    except DexcomAuthError:
        return NEEDS_AUTH
    except DexcomUpstreamError as exc:
        log.warning("Dexcom sync failed for user %s: %s", user.id, exc)
        return UPSTREAM

    ids = [str(r.get("recordId")) for r in records if r.get("recordId")]
    existing = set(db.scalars(select(GlucoseReading.external_id).where(
        GlucoseReading.user_id == user.id, GlucoseReading.source_device == SOURCE,
        GlucoseReading.external_id.in_(ids)))) if ids else set()
    imported = skipped = 0
    for record in records:
        rid = str(record.get("recordId") or "")
        value = _reading(record)
        system_time = _parse_time(record.get("systemTime"))
        display_time = _parse_time(record.get("displayTime")) or system_time
        if not rid or rid in existing or value is None or system_time is None or len(rid) > 100:
            skipped += 1
            continue
        if system_time.tzinfo is None:
            system_time = system_time.replace(tzinfo=timezone.utc)
        existing.add(rid)
        db.add(GlucoseReading(
            user_id=user.id, reading=value, source_device=SOURCE, external_id=rid,
            date_time=system_time.astimezone(timezone.utc), date=display_time.date(),
            reading_time=display_time.strftime("%H:%M"), trend=(str(record["trend"])[:20] if record.get("trend") else None),
            extra={"trend_rate": record.get("trendRate")} if record.get("trendRate") is not None else None,
        ))
        imported += 1
    profile.dexcom_last_sync_at = now
    db.commit()
    log.info("Dexcom sync for user %s: imported=%d skipped=%d", user.id, imported, skipped)
    return 200, {"success": True, "imported": imported, "skipped": skipped}


def disconnect(db: Session, user: User) -> tuple[int, dict]:
    profile = get_profile(db, user)
    if profile is not None:
        _clear_tokens(profile)
        db.commit()
    return 200, {"success": True}
