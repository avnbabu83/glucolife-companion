from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.ai.healthkit import glucose_scope
from app.db import new_session
from app.models import GlucoseReading

from .conftest import headers_for

URL = "/api/v1/glucose/import"


def consent(client, user, wearables=True, extra=None):
    body = {"wearables": wearables, "extra": extra or {}}
    assert client.post("/api/v1/entities/PrivacyConsent", headers=headers_for(user), json=body).status_code == 201


def sample(ext, value=110, when="2025-03-01T00:30:00-05:00", **kw):
    return {"external_id": ext, "reading_mg_dl": value, "date_time": when, **kw}


def test_auth_consent_and_validation(client, alice):
    assert client.post(URL, json={"samples": [sample("a")]}).status_code == 401
    h = headers_for(alice)
    assert client.post(URL, headers=h, json={"samples": [sample("a")]}).json() == {"error": "consent_required"}
    consent(client, alice)
    assert client.post(URL, headers=h, json={"samples": [sample(str(i)) for i in range(501)]}).status_code == 422
    assert client.post(URL, headers=h, json={"samples": [sample("a", extra_field=1)]}).status_code == 422


def test_import_is_idempotent_rejects_bad_samples_and_derives_local_date(client, alice, bob, caplog):
    consent(client, alice)
    consent(client, bob)
    future = (datetime.now(timezone.utc) + timedelta(minutes=11)).isoformat()
    batch = [sample("u1", source_app="com.dexcom.G7"), sample("u2", 123.4), sample("low", 19),
             sample("high", 601), sample("future", when=future)]
    caplog.set_level("INFO")
    r = client.post(URL, headers=headers_for(alice), json={"samples": batch})
    assert r.json() == {"received": 5, "imported": 2, "duplicates": 0, "rejected": 3}
    assert "123.4" not in caplog.text
    again = client.post(URL, headers=headers_for(alice), json={"samples": batch[:2]}).json()
    assert again == {"received": 2, "imported": 0, "duplicates": 2, "rejected": 0}
    assert client.post(URL, headers=headers_for(bob), json={"samples": batch[:1]}).json()["imported"] == 1
    with new_session() as db:
        row = db.scalars(select(GlucoseReading).where(GlucoseReading.user_id == alice.id,
                                                      GlucoseReading.external_id == "u1")).one()
        assert (str(row.date), row.reading_time, row.source_device) == ("2025-03-01", "00:30", "apple_health")
        assert row.extra["source_app"] == "com.dexcom.G7"


def test_ai_context_excludes_apple_health_without_ai_permission(client, alice, bob):
    consent(client, alice)
    consent(client, bob, extra={"ai_processing": True})
    for user in (alice, bob):
        client.post(URL, headers=headers_for(user), json={"samples": [sample("hk")]})
        client.post("/api/v1/entities/GlucoseReading", headers=headers_for(user),
                    json={"reading": 150, "date": "2025-03-01", "source_device": "manual"})
    with new_session() as db:
        def sources(user):
            return sorted(r.source_device for r in db.scalars(select(GlucoseReading).where(*glucose_scope(db, user))))
        assert sources(alice) == ["manual"]
        assert sources(bob) == ["apple_health", "manual"]
