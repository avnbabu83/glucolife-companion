import pytest

from app.db import new_session
from app.models import ENTITIES, UserProfile
from tests.conftest import headers_for

MINIMAL = {"GlucoseReading": {"reading": 120}, "Medication": {"name": "Metformin"}}


def test_status_page_and_health(client):
    page = client.get("/")
    assert page.status_code == 200 and "/api/v1/entities/{entity}" in page.text
    assert client.get("/healthz").json() == {"status": "ok"}


def test_glucose_crud_sort_limit_and_filters(client, alice):
    h = headers_for(alice)
    for day, value, source in [("2025-01-01", 110, "manual"), ("2025-01-03", 180, "manual"), ("2025-01-02", 95, "libre")]:
        resp = client.post("/api/v1/entities/GlucoseReading", headers=h,
                           json={"reading": value, "date": day, "source_device": source, "extra": {"note": "x"}})
        assert resp.status_code == 201, resp.text
        assert "user_id" not in resp.json()

    rows = client.get("/api/v1/entities/GlucoseReading?sort=-date", headers=h).json()
    assert [r["reading"] for r in rows] == [180, 95, 110]
    assert rows[0]["created_at"].endswith(("Z", "+00:00"))  # always UTC, also on SQLite
    assert client.get("/api/v1/entities/GlucoseReading?sort=date&limit=1", headers=h).json()[0]["reading"] == 110
    assert len(client.get("/api/v1/entities/GlucoseReading?source_device=manual", headers=h).json()) == 2
    assert len(client.get("/api/v1/entities/GlucoseReading?since=2025-01-02", headers=h).json()) == 2
    assert len(client.get("/api/v1/entities/GlucoseReading?sort=-created_date", headers=h).json()) == 3

    row_id = rows[0]["id"]
    patched = client.patch(f"/api/v1/entities/GlucoseReading/{row_id}", headers=h, json={"reading": 175})
    assert patched.status_code == 200 and patched.json()["reading"] == 175
    assert client.delete(f"/api/v1/entities/GlucoseReading/{row_id}", headers=h).status_code == 204
    assert client.get(f"/api/v1/entities/GlucoseReading/{row_id}", headers=h).status_code == 404


def test_boolean_filter_matches_base44_filter_semantics(client, alice):
    h = headers_for(alice)
    client.post("/api/v1/entities/MealPlan", headers=h, json={"meal_name": "Oats", "is_completed": True})
    client.post("/api/v1/entities/MealPlan", headers=h, json={"meal_name": "Salad"})
    done = client.get("/api/v1/entities/MealPlan?is_completed=true", headers=h).json()
    assert [m["meal_name"] for m in done] == ["Oats"]


def test_validation_errors(client, alice):
    h = headers_for(alice)
    assert client.post("/api/v1/entities/GlucoseReading", headers=h, json={"reading": 100, "bogus": 1}).status_code == 422
    assert client.post("/api/v1/entities/GlucoseReading", headers=h, json={}).status_code == 422
    assert client.post("/api/v1/entities/GlucoseReading", headers=h, json={"reading": 100, "user_id": "x"}).status_code == 422
    assert client.get("/api/v1/entities/GlucoseReading?extra=1", headers=h).status_code == 422
    assert client.get("/api/v1/entities/GlucoseReading?sort=-libre_password_enc", headers=h).status_code == 422
    assert client.get("/api/v1/entities/GlucoseReading?limit=501", headers=h).status_code == 200  # capped at 500
    assert client.get("/api/v1/entities/GlucoseReading?limit=0", headers=h).status_code == 422
    assert client.get("/api/v1/entities/User", headers=h).status_code == 404
    assert client.get("/api/v1/entities/users", headers=h).status_code == 404


@pytest.mark.parametrize("entity", list(ENTITIES))
def test_users_cannot_see_or_change_each_others_rows(client, alice, bob, entity):
    created = client.post(f"/api/v1/entities/{entity}", headers=headers_for(alice), json=MINIMAL.get(entity, {}))
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]
    hb = headers_for(bob)
    assert client.get(f"/api/v1/entities/{entity}", headers=hb).json() == []
    assert client.get(f"/api/v1/entities/{entity}/{row_id}", headers=hb).status_code == 404
    assert client.patch(f"/api/v1/entities/{entity}/{row_id}", headers=hb, json={"extra": {"x": 1}}).status_code == 404
    assert client.delete(f"/api/v1/entities/{entity}/{row_id}", headers=hb).status_code == 404
    # Alice's row is untouched.
    assert client.get(f"/api/v1/entities/{entity}/{row_id}", headers=headers_for(alice)).json()["extra"] is None


def test_user_profile_never_exposes_credentials(client, alice):
    h = headers_for(alice)
    assert client.post("/api/v1/entities/UserProfile", headers=h, json={"diabetes_type": "type2"}).status_code == 201
    assert client.post("/api/v1/entities/UserProfile", headers=h, json={}).status_code == 409
    with new_session() as db:
        profile = db.query(UserProfile).filter_by(user_id=alice.id).one()
        profile.libre_email = "libre@example.com"
        profile.libre_password_enc = "v1:secret"
        profile.fitbit_access_token_enc = "v1:secret"
        profile.fitbit_refresh_token_enc = "v1:secret"
        db.commit()
    body = client.get("/api/v1/entities/UserProfile", headers=h).json()[0]
    assert not any(key.endswith("_enc") for key in body)
    assert "fitbit_token_expires_at" not in body
    assert body["libre_connected"] is True and body["fitbit_connected"] is True
    assert body["libre_email"] == "libre@example.com"
    for field in ("libre_password_enc", "libre_password", "fitbit_access_token_enc", "libre_email"):
        resp = client.patch(f"/api/v1/entities/UserProfile/{body['id']}", headers=h, json={field: "x"})
        assert resp.status_code == 422, field
