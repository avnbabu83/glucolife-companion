"""Demo sign-in: works only with APP_ENV=preview, 404 otherwise."""

from tests.conftest import get_settings


def test_demo_sign_in_works_in_preview(client, monkeypatch):
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    assert client.get("/healthz").json()["preview_mode"] is True

    resp = client.post("/api/v1/auth/demo", json={"client": "ios"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/v1/me", headers=headers).json()["email"] == body["user"]["email"]
    readings = client.get("/api/v1/entities/GlucoseReading", headers=headers).json()
    assert len(readings) >= 14
    assert client.get("/api/v1/entities/MealPlan", headers=headers).json()
    assert client.get("/api/v1/entities/ExerciseLog", headers=headers).json()

    # Second sign-in reuses the same account and does not duplicate the sample data.
    again = client.post("/api/v1/auth/demo", json={"client": "ios"}).json()
    assert again["user"]["id"] == body["user"]["id"]
    assert len(client.get("/api/v1/entities/GlucoseReading", headers=headers).json()) == len(readings)


def test_demo_sign_in_is_404_outside_preview(client, monkeypatch):
    for env in ("test", "development", "staging"):
        monkeypatch.setenv("APP_ENV", env)
        get_settings.cache_clear()
        assert client.post("/api/v1/auth/demo", json={}).status_code == 404
        assert client.get("/healthz").json()["preview_mode"] is False
