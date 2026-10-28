"""Phase 4a: Dexcom provider (fake Dexcom endpoints via httpx.MockTransport)."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import select

from app import http
from app.config import get_settings
from app.db import new_session
from app.integrations import dexcom
from app.models import GlucoseReading, UserProfile
from tests.conftest import headers_for

WEB = "https://diabeteasy.com/dexcom/callback"
BASE = "https://sandbox-api.dexcom.com"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("DEXCOM_CLIENT_ID", "dexcom-client")
    monkeypatch.setenv("DEXCOM_CLIENT_SECRET", "dexcom-secret-placeholder")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeDexcom:
    def __init__(self):
        self.refresh_tokens = {"refresh-1"}
        self.valid_access = {"access-1"}
        self.counter = 1
        self.egv_status = 200
        self.records = [
            {"recordId": "r1", "systemTime": "2025-01-15T10:00:00Z", "displayTime": "2025-01-15T05:00:00-05:00",
             "value": 120, "unit": "mg/dL", "trend": "flat", "trendRate": 0.1},
            {"recordId": "r2", "systemTime": "2025-01-15T10:05:00", "displayTime": "2025-01-15T05:05:00",
             "value": 7.0, "unit": "mmol/L", "trend": "singleUp"},
            {"recordId": "r3", "systemTime": "2025-01-15T10:10:00", "displayTime": "2025-01-15T05:10:00",
             "value": None, "unit": "mg/dL"},
        ]
        self.token_bodies = []

    def _issue(self):
        self.counter += 1
        access, refresh = f"access-{self.counter}", f"refresh-{self.counter}"
        self.valid_access.add(access)
        self.refresh_tokens.add(refresh)
        return httpx.Response(200, json={"access_token": access, "refresh_token": refresh, "expires_in": 7200})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v2/oauth2/token":
            form = parse_qs(request.content.decode())
            self.token_bodies.append(form)
            if form["grant_type"] == ["authorization_code"]:
                return self._issue() if form["code"] == ["good-code"] else httpx.Response(400, json={})
            token = form["refresh_token"][0]
            if token not in self.refresh_tokens:
                return httpx.Response(400, json={"error": "invalid_grant"})
            self.refresh_tokens.discard(token)  # single-use
            return self._issue()
        if request.url.path == "/v3/users/self/egvs":
            if self.egv_status != 200:
                return httpx.Response(self.egv_status)
            if request.headers["Authorization"].removeprefix("Bearer ") not in self.valid_access:
                return httpx.Response(401)
            return httpx.Response(200, json={"records": self.records})
        return httpx.Response(404)


def connect(client, user, fake):
    http.set_transport(httpx.MockTransport(fake))
    resp = client.post("/api/v1/integrations/dexcom/connect", headers=headers_for(user), json={"redirect_uri": WEB})
    assert resp.status_code == 200
    url = resp.json()["authorize_url"]
    assert url.startswith(f"{BASE}/v2/oauth2/login?")
    state = parse_qs(urlparse(url).query)["state"][0]
    resp = client.post("/api/v1/integrations/dexcom/connect", headers=headers_for(user),
                       json={"code": "good-code", "state": state, "redirect_uri": WEB})
    assert resp.status_code == 200, resp.text
    return state


def test_not_configured_returns_503_and_me_hides_dexcom(client, alice):
    resp = client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice))
    assert resp.status_code == 503 and resp.json() == {"error": "dexcom_not_configured"}
    assert "dexcom" not in client.get("/api/v1/me", headers=headers_for(alice)).json()["integrations_available"]


def test_state_is_bound_to_user_redirect_and_time(client, alice, bob, configured, monkeypatch):
    state = dexcom.seal_state(alice.id, WEB)
    assert dexcom.state_valid(state, alice.id, WEB)
    assert not dexcom.state_valid(state, bob.id, WEB)
    assert not dexcom.state_valid(state, alice.id, "https://diabeteasy.com/app/dexcom/callback")
    assert not dexcom.state_valid(dexcom.seal_state(alice.id, WEB, now=0), alice.id, WEB)
    resp = client.post("/api/v1/integrations/dexcom/connect", headers=headers_for(bob),
                       json={"code": "good-code", "state": state, "redirect_uri": WEB})
    assert resp.status_code == 400 and resp.json()["error"] == "invalid_state"
    resp = client.post("/api/v1/integrations/dexcom/connect", headers=headers_for(alice),
                       json={"redirect_uri": "https://evil.example/cb"})
    assert resp.status_code == 400


def test_connect_sync_dedupe_and_hidden_tokens(client, alice, configured):
    fake = FakeDexcom()
    connect(client, alice, fake)
    assert "dexcom" in client.get("/api/v1/me", headers=headers_for(alice)).json()["integrations_available"]
    profile = client.get("/api/v1/entities/UserProfile", headers=headers_for(alice)).json()[0]
    assert profile["dexcom_connected"] is True
    assert not any(k.startswith("dexcom_") and k.endswith("_enc") for k in profile)
    assert "access-2" not in str(profile)

    first = client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice)).json()
    assert first == {"success": True, "imported": 2, "skipped": 1}
    with new_session() as db:
        rows = {r.external_id: r for r in db.scalars(select(GlucoseReading))}
        assert rows["r1"].source_device == "dexcom" and rows["r1"].reading == 120
        assert rows["r1"].reading_time == "05:00" and rows["r2"].reading == 126.1
        stored = db.scalar(select(UserProfile))
        assert "access-2" not in stored.dexcom_access_token_enc
    again = client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice)).json()
    assert again["imported"] == 0

    assert client.post("/api/v1/integrations/dexcom/disconnect", headers=headers_for(alice)).status_code == 200
    profile = client.get("/api/v1/entities/UserProfile", headers=headers_for(alice)).json()[0]
    assert profile["dexcom_connected"] is False


def test_expired_token_refreshes_and_rotated_token_is_saved(client, alice, configured):
    fake = FakeDexcom()
    connect(client, alice, fake)
    fake.valid_access.clear()  # the stored access token is no longer accepted
    resp = client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice))
    assert resp.status_code == 200 and resp.json()["imported"] == 2
    # the first refresh token was used once; the rotated one must have been stored and work again
    fake.valid_access.clear()
    assert client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice)).status_code == 200


def test_revoked_refresh_needs_auth_and_upstream_error_is_502(client, alice, configured):
    fake = FakeDexcom()
    connect(client, alice, fake)
    fake.egv_status = 503
    assert client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice)).status_code == 502
    fake.egv_status = 200
    fake.valid_access.clear()
    fake.refresh_tokens.clear()
    resp = client.post("/api/v1/integrations/dexcom/sync", headers=headers_for(alice))
    assert resp.status_code == 400 and resp.json()["needsAuth"] is True


def test_account_deletion_removes_dexcom_columns(client, alice, configured):
    connect(client, alice, FakeDexcom())
    assert client.delete("/api/v1/me", headers=headers_for(alice)).status_code == 204
    with new_session() as db:
        assert db.scalar(select(UserProfile)) is None
