import hashlib
import json
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import func, select

from app import http
from app.db import new_session
from app.integrations.fitbit import _store_tokens
from app.models import ActivityData, GlucoseReading, SleepLog, UserProfile
from tests.conftest import headers_for

CONNECTIONS = {"data": [{
    "glucoseMeasurement": {"Value": 6.1, "Timestamp": "1/15/2025 10:30:00 AM", "TrendArrow": 3},
    "graphData": [
        {"Value": 5.5, "Timestamp": "1/15/2025 10:15:00 AM"},
        {"Value": 110, "Timestamp": "1/15/2025 10:00:00 AM"},
        {"Value": 6.1, "Timestamp": "1/15/2025 10:30:00 AM"},
    ],
}]}


def libre_handler(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if url == "https://api-us.libreview.io/llu/auth/login":
        return httpx.Response(200, json={"status": 0, "data": {"redirect": True, "region": "eu"}})
    if url == "https://api-eu.libreview.io/llu/auth/login":
        if json.loads(request.content)["password"] != "correct-password":
            return httpx.Response(200, json={"status": 2, "error": {"message": "notAuthenticated"}})
        return httpx.Response(200, json={"status": 0, "data": {
            "user": {"id": "libre-user-1", "firstName": "Alice"}, "authTicket": {"token": "libre-token"}}})
    if url == "https://api-eu.libreview.io/llu/connections":
        assert request.headers["Authorization"] == "Bearer libre-token"
        assert request.headers["Account-Id"] == hashlib.sha256(b"libre-user-1").hexdigest()
        return httpx.Response(200, json=CONNECTIONS)
    return httpx.Response(404)


def count(model, user):
    with new_session() as db:
        return db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id))


def test_libre_connect_and_repeated_sync_creates_no_duplicates(client, alice):
    http.set_transport(httpx.MockTransport(libre_handler))
    h = headers_for(alice)
    assert client.post("/api/v1/integrations/libre/sync", headers=h).json()["needsAuth"] is True

    bad = client.post("/api/v1/integrations/libre/connect", headers=h, json={"email": "a@x.com", "password": "nope"})
    assert bad.status_code == 401
    ok = client.post("/api/v1/integrations/libre/connect", headers=h,
                     json={"email": "a@x.com", "password": "correct-password"})
    assert ok.status_code == 200 and ok.json()["patientName"] == "Alice"
    with new_session() as db:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == alice.id))
        assert profile.libre_region == "eu"
        assert "correct-password" not in profile.libre_password_enc  # stored encrypted

    first = client.post("/api/v1/integrations/libre/sync", headers=h).json()
    assert first["synced"] == 3 and first["total"] == 4
    second = client.post("/api/v1/integrations/libre/sync", headers=h).json()
    assert second["synced"] == 0 and second["message"] == "All readings are already synced"
    assert count(GlucoseReading, alice) == 3
    with new_session() as db:
        values = sorted(r.reading for r in db.scalars(select(GlucoseReading)))
        assert values == [99, 110, 110]  # mmol/L converted to mg/dL

    assert client.post("/api/v1/integrations/libre/disconnect", headers=h).status_code == 200
    assert client.post("/api/v1/integrations/libre/sync", headers=h).json()["needsAuth"] is True


FITBIT = {
    "/1.2/user/-/sleep/date/2025-01-15.json": {"sleep": [{
        "logId": 111, "isMainSleep": True, "startTime": "2025-01-14T23:10:00.000",
        "endTime": "2025-01-15T06:40:00.000", "duration": 27_000_000, "efficiency": 92,
        "levels": {"summary": {"deep": {"minutes": 80}, "rem": {"minutes": 90}, "light": {"minutes": 250},
                               "wake": {"count": 3}}},
    }]},
    "/1/user/-/activities/date/2025-01-15.json": {"summary": {
        "steps": 8000, "caloriesOut": 2100, "veryActiveMinutes": 20, "fairlyActiveMinutes": 15}},
    "/1/user/-/activities/heart/date/2025-01-15/1d.json": {"activities-heart": [{"value": {"restingHeartRate": 62}}]},
}


def fitbit_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/oauth2/token":
        return httpx.Response(401, json={"errors": [{"errorType": "invalid_grant"}]})
    if request.headers.get("Authorization") != "Bearer fitbit-access":
        return httpx.Response(401)
    return httpx.Response(200, json=FITBIT[request.url.path])


def give_fitbit_tokens(user, expires_in=3600):
    with new_session() as db:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        _store_tokens(profile, {"access_token": "fitbit-access", "refresh_token": "fitbit-refresh",
                                "expires_in": expires_in})
        db.commit()


def test_fitbit_repeated_sync_creates_no_duplicates(alice, monkeypatch):
    from app.integrations import fitbit

    http.set_transport(httpx.MockTransport(fitbit_handler))
    give_fitbit_tokens(alice)
    with new_session() as db:
        status, first = fitbit.sync(db, db.merge(alice), today=date(2025, 1, 15))
    assert status == 200 and first["data"] == {"sleep": 1, "steps": 8000, "calories": 2100, "heartRate": 62}
    with new_session() as db:
        status, _ = fitbit.sync(db, db.merge(alice), today=date(2025, 1, 15))
    assert status == 200
    assert count(SleepLog, alice) == 1 and count(ActivityData, alice) == 1
    with new_session() as db:
        sleep = db.scalar(select(SleepLog))
        assert (sleep.bedtime, sleep.wake_time, sleep.total_hours, sleep.quality) == ("23:10", "06:40", 7.5, "excellent")
        activity = db.scalar(select(ActivityData))
        assert (activity.steps, activity.active_minutes, activity.resting_heart_rate) == (8000, 35, 62)


def test_fitbit_expired_token_with_failed_refresh_asks_to_reconnect(client, alice):
    http.set_transport(httpx.MockTransport(fitbit_handler))
    give_fitbit_tokens(alice, expires_in=-10)
    resp = client.post("/api/v1/integrations/fitbit/sync", headers=headers_for(alice))
    assert resp.status_code == 401 and resp.json()["needsAuth"] is True
    with new_session() as db:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == alice.id))
        assert profile.fitbit_access_token_enc is None and profile.fitbit_refresh_token_enc is None


def test_fitbit_connect_exchanges_code_for_per_user_tokens(client, alice):
    def handler(request):
        assert request.url.path == "/oauth2/token" and b"code=abc123" in request.content
        return httpx.Response(200, json={"access_token": "a", "refresh_token": "r", "expires_in": 28800})

    http.set_transport(httpx.MockTransport(handler))
    resp = client.post("/api/v1/integrations/fitbit/connect", headers=headers_for(alice), json={"code": "abc123"})
    assert resp.status_code == 200
    profile = client.get("/api/v1/entities/UserProfile", headers=headers_for(alice)).json()[0]
    assert profile["fitbit_connected"] is True
    with new_session() as db:
        stored = db.scalar(select(UserProfile)).fitbit_token_expires_at
        assert stored.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) + timedelta(hours=7)
