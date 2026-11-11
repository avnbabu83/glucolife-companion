import hashlib
import time

import pytest

from app.auth import idtoken
from app.db import new_session
from app.models import User
from tests.conftest import make_user


def sign_in(test_client, provider, token, **body):
    return test_client.post(f"/api/v1/auth/{provider}", json={"id_token": token, **body})


def test_google_sign_in_creates_user_and_refresh_works(client, id_tokens):
    resp = sign_in(client, "google", id_tokens.token(sub="g-1", name="Alice A"), client="ios")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["providers"] == ["google"]
    assert data["expires_in"] == 15 * 60
    assert data["refresh_token"]

    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200 and me.json()["full_name"] == "Alice A"

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert refreshed.status_code == 200
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"}).status_code == 200

    # Signing in again finds the same user by provider subject.
    again = sign_in(client, "google", id_tokens.token(sub="g-1"), client="ios")
    assert again.json()["user"]["id"] == data["user"]["id"]


def test_web_sign_in_uses_httponly_refresh_cookie(client, id_tokens):
    resp = sign_in(client, "google", id_tokens.token())
    assert resp.status_code == 200
    assert resp.json()["refresh_token"] is None
    cookie = resp.headers["set-cookie"]
    assert "dz_refresh=" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie.replace("Strict", "strict")
    refreshed = client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "XMLHttpRequest"})
    assert refreshed.status_code == 200, refreshed.text


def test_apple_sign_in_links_copied_base44_user_by_verified_email(client, id_tokens):
    existing = make_user("alice@example.com", base44_id="b44-user-1")
    resp = sign_in(client, "apple", id_tokens.token("apple", sub="apple-001"), client="ios", full_name="Alice")
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == existing.id
    with new_session() as db:
        user = db.get(User, existing.id)
        assert user.apple_sub == "apple-001" and user.full_name == "Alice"


def test_unverified_email_does_not_link_to_existing_account(client, id_tokens):
    make_user("alice@example.com")
    resp = sign_in(client, "google", id_tokens.token(email_verified=False))
    assert resp.status_code == 409


@pytest.mark.parametrize("case", ["expired", "wrong_audience", "wrong_issuer", "bad_signature", "garbage"])
def test_invalid_id_tokens_are_rejected(client, id_tokens, case):
    now = int(time.time())
    token = {
        "expired": lambda: id_tokens.token(iat=now - 7200, exp=now - 3600),
        "wrong_audience": lambda: id_tokens.token(aud="someone-else"),
        "wrong_issuer": lambda: id_tokens.token(iss="https://evil.example.com"),
        "bad_signature": lambda: id_tokens.token(sign_with=id_tokens.other_key),
        "garbage": lambda: "not-a-jwt-at-all",
    }[case]()
    assert sign_in(client, "google", token).status_code == 401


def test_apple_nonce_is_checked(client, id_tokens):
    raw = "raw-nonce-123"
    token = id_tokens.token("apple", nonce=hashlib.sha256(raw.encode()).hexdigest())
    assert sign_in(client, "apple", token, nonce="wrong").status_code == 401
    assert sign_in(client, "apple", token, nonce=raw).status_code == 200


def test_logout_invalidates_refresh_and_access_tokens(client, id_tokens):
    data = sign_in(client, "google", id_tokens.token(), client="ios").json()
    auth = {"Authorization": f"Bearer {data['access_token']}"}
    assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]}).status_code == 401
    assert client.get("/api/v1/me", headers=auth).status_code == 401


def test_unreachable_provider_keys_without_cache_returns_503(client, id_tokens):
    token = id_tokens.token()

    def down(_url):
        raise ConnectionError("network down")

    idtoken._caches["google"] = idtoken.JWKSCache("https://test/jwks", fetcher=down)
    assert sign_in(client, "google", token).status_code == 503


def test_data_endpoints_require_a_token(client):
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/entities/GlucoseReading").status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
