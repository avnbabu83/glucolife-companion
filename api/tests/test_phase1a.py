"""Phase 1a quality gates: settings, health, OpenAPI contract, token rules, entity rules, isolation and deletion."""

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.auth.tokens import issue_refresh_token
from app.config import get_settings, load_settings
from app.db import new_session, reset_engine
from app.main import app
from app.models import ENTITIES, User
from tests.conftest import headers_for
from tests.test_auth import sign_in

API_DIR = Path(__file__).resolve().parents[1]
MINIMAL = {"GlucoseReading": {"reading": 120}, "Medication": {"name": "Metformin"}}


def test_settings_refuse_short_jwt_secret_and_missing_production_secrets(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "too-short")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        load_settings()
    monkeypatch.setenv("JWT_SECRET", "p" * 40)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("CREDENTIALS_KEY")
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    with pytest.raises(RuntimeError, match="CREDENTIALS_KEY"):
        load_settings()


def test_healthz_returns_503_without_details_when_database_unreachable(client, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none?connect_timeout=1")
    get_settings.cache_clear()
    reset_engine()
    resp = client.get("/healthz")
    assert resp.status_code == 503
    assert resp.json() == {"status": "unavailable"}


def test_committed_openapi_matches_generated():
    committed = json.loads((API_DIR / "openapi.json").read_text(encoding="utf-8"))
    generated = json.loads(json.dumps(app.openapi()))
    assert committed == generated, "Regenerate: cd api && python -m app.scripts.export_openapi openapi.json"


def test_alembic_upgrade_check_and_downgrade(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/alembic.db")
    get_settings.cache_clear()
    reset_engine()
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    command.upgrade(cfg, "head")
    command.check(cfg)  # raises if the models and the migration drift apart
    command.downgrade(cfg, "base")


def test_refresh_token_is_not_an_access_token_and_cookie_refresh_needs_header(client, id_tokens, alice):
    refresh = issue_refresh_token(alice)
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401
    resp = sign_in(client, "google", id_tokens.token(sub="g-web"), client="web")
    assert resp.status_code == 200, resp.text
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api/v1/auth" in cookie
    assert client.post("/api/v1/auth/refresh").status_code == 403
    assert client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "XMLHttpRequest"}).status_code == 200


def test_google_then_apple_with_same_verified_email_is_one_user(client, id_tokens):
    google = sign_in(client, "google", id_tokens.token(sub="g-7"), client="ios").json()
    apple = sign_in(client, "apple", id_tokens.token("apple", sub="a-7"), client="ios").json()
    assert google["user"]["id"] == apple["user"]["id"]
    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        user = db.get(User, apple["user"]["id"])
        assert user.google_sub == "g-7" and user.apple_sub == "a-7"


def test_entity_api_rules(client, alice):
    h = headers_for(alice)
    assert client.get("/api/v1/entities/Nope", headers=h).status_code == 404
    assert client.get("/api/v1/entities/GlucoseReading?colour=red", headers=h).status_code == 422
    assert client.get("/api/v1/entities/GlucoseReading?sort=-colour", headers=h).status_code == 422
    assert client.post("/api/v1/entities/GlucoseReading", headers=h, json={"reading": 1, "user_id": "x"}).status_code == 422
    assert client.get("/api/v1/entities/GlucoseReading?limit=1000", headers=h).status_code == 200  # capped at 500
    assert client.post("/api/v1/entities/UserProfile", headers=h, json={}).status_code == 201
    assert client.post("/api/v1/entities/UserProfile", headers=h, json={}).status_code == 409


@pytest.mark.parametrize("entity", sorted(ENTITIES))
def test_users_are_isolated_for_every_entity(client, alice, bob, entity):
    row = client.post(f"/api/v1/entities/{entity}", headers=headers_for(alice), json=MINIMAL.get(entity, {}))
    assert row.status_code == 201, row.text
    hb = headers_for(bob)
    url = f"/api/v1/entities/{entity}/{row.json()['id']}"
    assert client.patch(url, headers=hb, json={"extra": {"x": 1}}).status_code == 404
    assert client.delete(url, headers=hb).status_code == 404
    assert client.get(f"/api/v1/entities/{entity}", headers=hb).json() == []


def test_delete_account_empties_all_tables_even_if_apple_revoke_fails(client, alice, bob, monkeypatch):
    calls = []

    def failing_revoke(token):
        calls.append(token)
        raise RuntimeError("apple unavailable")

    monkeypatch.setattr("app.routers.me.apple.revoke", failing_revoke)
    with new_session() as db:
        db.get(User, alice.id).apple_refresh_token_enc = "enc-token"
        db.commit()
    for user in (alice, bob):
        for entity in ENTITIES:
            resp = client.post(f"/api/v1/entities/{entity}", headers=headers_for(user), json=MINIMAL.get(entity, {}))
            assert resp.status_code == 201, resp.text

    assert client.delete("/api/v1/me", headers=headers_for(alice)).status_code == 204
    assert calls == ["enc-token"]
    with new_session() as db:
        assert db.get(User, alice.id) is None
        for model in ENTITIES.values():  # includes StressLog, which Base44's deleteAccount missed
            assert db.scalar(select(func.count()).select_from(model).where(model.user_id == alice.id)) == 0
            assert db.scalar(select(func.count()).select_from(model).where(model.user_id == bob.id)) == 1
