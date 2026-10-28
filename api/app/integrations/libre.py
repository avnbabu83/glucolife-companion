"""FreeStyle Libre via the (unofficial) LibreLinkUp API, ported from
base44/functions/connectLibre and syncLibreData.

Same login flow and regional redirect as today; the only changes are that the
password is stored encrypted and readings are de-duplicated by the database
constraint (user_id, source_device, external_id).
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import http
from app.integrations.profile import get_or_create_profile, get_profile
from app.models import GlucoseReading, User
from app.security.crypto import decrypt, encrypt

log = logging.getLogger("diabeteasy.libre")

REGION_MAP = {
    "us": "https://api-us.libreview.io",
    "eu": "https://api-eu.libreview.io",
    "de": "https://api-de.libreview.io",
    "fr": "https://api-fr.libreview.io",
    "jp": "https://api-jp.libreview.io",
    "ap": "https://api-ap.libreview.io",
    "au": "https://api-au.libreview.io",
    "ca": "https://api-ca.libreview.io",
    "global": "https://api.libreview.io",
}
DEFAULT_ENDPOINTS = ["https://api-us.libreview.io", "https://api.libreview.io", "https://api-eu.libreview.io"]
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Product": "llu.android",
    "Version": "4.17.0",
}
TREND_MAP = {
    1: "rising_fast", "SINGLE_UP": "rising_fast",
    2: "rising", "FORTY_FIVE_UP": "rising",
    3: "stable", "FLAT": "stable",
    4: "falling", "FORTY_FIVE_DOWN": "falling",
    5: "falling_fast", "SINGLE_DOWN": "falling_fast",
}
SOURCE = "libre"


class LibreAuthError(Exception):
    pass


class LibreError(Exception):
    pass


@dataclass
class LibreSession:
    endpoint: str
    token: str
    user_id: str | None
    region: str | None
    first_name: str | None = None


def _region_for(endpoint: str) -> str | None:
    return next((k for k, v in REGION_MAP.items() if v == endpoint), None)


def _extract(data: dict) -> tuple[str | None, str | None, str | None]:
    inner = data.get("data") or {}
    token = (inner.get("authTicket") or {}).get("token") or (data.get("authTicket") or {}).get("token")
    user = inner.get("user") or data.get("user") or {}
    return token, user.get("id"), user.get("firstName")


def login(email: str, password: str, region: str | None = None) -> LibreSession:
    endpoints = list(DEFAULT_ENDPOINTS)
    if region in REGION_MAP:
        endpoints.insert(0, REGION_MAP[region])
    body = {"email": email, "password": password}
    with http.client() as c:
        for endpoint in dict.fromkeys(endpoints):
            try:
                resp = c.post(f"{endpoint}/llu/auth/login", json=body, headers=HEADERS)
                if resp.status_code != 200:
                    continue
                data = resp.json()
                used = endpoint
                inner = data.get("data") or {}
                if inner.get("redirect") and inner.get("region"):
                    regional = REGION_MAP.get(inner["region"])
                    if not regional:
                        continue
                    redirect = c.post(f"{regional}/llu/auth/login", json=body, headers=HEADERS)
                    if redirect.status_code != 200:
                        continue
                    data, used = redirect.json(), regional
                token, user_id, first_name = _extract(data)
                if token:
                    return LibreSession(used, token, user_id, _region_for(used), first_name)
            except (httpx.HTTPError, ValueError):
                continue
    raise LibreAuthError("Failed to authenticate with LibreLinkUp. Please reconnect.")


def fetch_readings(session: LibreSession) -> list[dict[str, Any]]:
    headers = {**HEADERS, "Authorization": f"Bearer {session.token}"}
    if session.user_id:
        headers["Account-Id"] = hashlib.sha256(session.user_id.encode()).hexdigest()
    with http.client() as c:
        resp = c.get(f"{session.endpoint}/llu/connections", headers=headers)
    if resp.status_code == 401:
        raise LibreAuthError("LibreLinkUp rejected the session. Please reconnect.")
    if resp.status_code != 200:
        raise LibreError(f"Failed to fetch connections ({resp.status_code})")
    data = resp.json()
    readings: list[dict[str, Any]] = []
    connections = data.get("data")
    if isinstance(connections, list) and connections:
        conn = connections[0]
        m = conn.get("glucoseMeasurement")
        if m:
            readings.append({"value": m.get("Value"), "timestamp": m.get("Timestamp"), "trend": m.get("TrendArrow")})
        item = conn.get("glucoseItem") or {}
        if item.get("Value"):
            readings.append({"value": item.get("Value"), "timestamp": item.get("Timestamp")})
        for r in conn.get("graphData") or []:
            readings.append({"value": r.get("Value"), "timestamp": r.get("Timestamp")})
    return readings


def parse_timestamp(raw: str) -> datetime | None:
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def to_rows(readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for r in readings:
        if r.get("value") is None or not r.get("timestamp"):
            continue
        ts = parse_timestamp(str(r["timestamp"]))
        if ts is None:
            continue
        ts = ts.astimezone(timezone.utc)
        value = float(r["value"])
        if value < 25:  # LibreLinkUp reports mmol/L in most regions; store mg/dL
            value = round(value * 18.018)
        external_id = ts.strftime("%Y-%m-%dT%H:%M")
        rows.setdefault(external_id, {
            "reading": value,
            "date": ts.date(),
            "date_time": ts,
            "reading_time": ts.strftime("%H:%M"),
            "context": "random",
            "trend": TREND_MAP.get(r.get("trend"), "stable") if r.get("trend") is not None else "stable",
            "source_device": SOURCE,
            "external_id": external_id,
        })
    return list(rows.values())


def connect(db: Session, user: User, email: str, password: str) -> tuple[int, dict]:
    try:
        session = login(email, password)
    except LibreAuthError:
        return 401, {"error": "Failed to authenticate with LibreLinkUp on all regional endpoints"}
    profile = get_or_create_profile(db, user)
    profile.libre_email = email
    profile.libre_password_enc = encrypt(password)
    profile.libre_region = session.region
    db.commit()
    return 200, {"success": True, "message": "LibreLinkUp connected successfully", "patientName": session.first_name}


def sync(db: Session, user: User) -> tuple[int, dict]:
    profile = get_profile(db, user)
    if not profile or not profile.libre_email or not profile.libre_password_enc:
        return 400, {"needsAuth": True, "error": "Please connect your LibreLinkUp account first"}
    try:
        session = login(profile.libre_email, decrypt(profile.libre_password_enc) or "", profile.libre_region)
        readings = fetch_readings(session)
    except LibreAuthError as exc:
        return 401, {"needsAuth": True, "error": str(exc)}
    except (LibreError, httpx.HTTPError, ValueError) as exc:
        log.warning("Libre sync failed for user %s: %s", user.id, exc)
        return 502, {"error": "LibreLinkUp is not responding as expected, try again later"}

    if session.region and session.region != profile.libre_region:
        profile.libre_region = session.region
    rows = to_rows(readings)
    if not rows:
        db.commit()
        return 200, {
            "success": True,
            "synced": 0,
            "message": "No glucose readings found. Make sure you have an active connection.",
        }

    existing = set(db.scalars(
        select(GlucoseReading.external_id).where(
            GlucoseReading.user_id == user.id,
            GlucoseReading.source_device == SOURCE,
            GlucoseReading.external_id.in_([r["external_id"] for r in rows]),
        )
    ))
    synced = 0
    for row in rows:
        if row["external_id"] in existing:
            continue
        try:
            with db.begin_nested():
                db.add(GlucoseReading(user_id=user.id, **row))
            synced += 1
        except IntegrityError:  # a concurrent sync inserted it first
            continue
    db.commit()
    return 200, {
        "success": True,
        "synced": synced,
        "total": len(readings),
        "message": f"Synced {synced} new glucose readings" if synced else "All readings are already synced",
    }


def disconnect(db: Session, user: User) -> tuple[int, dict]:
    profile = get_profile(db, user)
    if profile:
        profile.libre_email = None
        profile.libre_password_enc = None
        profile.libre_region = None
        db.commit()
    return 200, {"success": True, "message": "LibreLinkUp disconnected"}
