import json
from pathlib import Path

import httpx
from sqlalchemy import func, select

from app import http
from app.ai.tasks import WeeklyInsightsOut
from app.db import new_session
from app.email import ConsoleEmail
from app.integrations.fitbit import _store_tokens
from app.jobs import weekly_insights
from app.models import ENTITIES, PrivacyConsent, User, UserProfile
from app.storage import get_storage
from tests.conftest import headers_for, make_user

SNAPSHOT = Path(__file__).parent / "snapshots" / "weekly_insights_email.txt"
REPLY = json.dumps({
    "summary": "Your glucose stayed in range most of the week.",
    "achievements": ["Logged meals every day", "Walked after dinner"],
    "improvements": ["Morning readings were high"],
    "action_items": ["Eat breakfast before 8:00", "Keep the evening walks", "Log sleep each night"],
})


def test_email_template_matches_snapshot():
    insights = WeeklyInsightsOut.model_validate_json(REPLY)
    assert weekly_insights.render_email("Alice", insights) == SNAPSHOT.read_text(encoding="utf-8")


def test_email_template_fallbacks_for_empty_lists():
    body = weekly_insights.render_email(None, WeeklyInsightsOut(summary="Quiet week."))
    assert body.startswith("Hi there,")
    assert "Keep logging your data!" in body and "You're doing great!" in body and "Keep up the good work!" in body


def test_weekly_job_sends_once_per_week_and_respects_consent(fake_ai):
    fake_ai(REPLY)
    alice = make_user("alice@example.com", full_name="Alice")
    bob = make_user("bob@example.com", full_name="Bob")
    make_user("carol@example.com")  # no profile: skipped, like today
    with new_session() as db:
        db.add_all([UserProfile(user_id=alice.id), UserProfile(user_id=bob.id)])
        db.add(PrivacyConsent(user_id=bob.id, email=False))
        db.commit()
    sender = ConsoleEmail()

    first = weekly_insights.run(week="2025-W03", sender=sender, retry_delay=0)
    assert (first.sent, first.no_consent, first.no_profile, first.failed) == (1, 1, 1, 0)
    assert [m.to for m in sender.sent] == ["alice@example.com"]
    assert sender.sent[0].subject == "Your Weekly Diabetes Insights"
    assert sender.sent[0].body == SNAPSHOT.read_text(encoding="utf-8")

    second = weekly_insights.run(week="2025-W03", sender=sender, retry_delay=0)
    assert second.sent == 0 and second.already_sent == 1 and len(sender.sent) == 1


def test_weekly_job_continues_after_a_user_fails(fake_ai):
    from app.ai.client import AIUnavailable

    fake = fake_ai(AIUnavailable("down"), AIUnavailable("down"), REPLY)
    for email in ("a@example.com", "b@example.com"):
        user = make_user(email)
        with new_session() as db:
            db.add(UserProfile(user_id=user.id))
            db.commit()
    sender = ConsoleEmail()
    result = weekly_insights.run(week="2025-W04", sender=sender, attempts=2, retry_delay=0)
    assert result.failed == 1 and result.sent == 1 and len(fake.calls) == 3


def test_delete_account_removes_all_rows_files_and_revokes_fitbit(client, alice, bob):
    h = headers_for(alice)
    for entity in ENTITIES:
        body = {"GlucoseReading": {"reading": 99}, "Medication": {"name": "Insulin"}}.get(entity, {})
        assert client.post(f"/api/v1/entities/{entity}", headers=h, json=body).status_code == 201
    client.post("/api/v1/entities/GlucoseReading", headers=headers_for(bob), json={"reading": 101})
    upload = client.post("/api/v1/uploads", headers=h, files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 10)})
    assert upload.status_code == 201
    with new_session() as db:
        profile = db.scalar(select(UserProfile).where(UserProfile.user_id == alice.id))
        _store_tokens(profile, {"access_token": "fitbit-access", "refresh_token": "fitbit-refresh", "expires_in": 3600})
        db.commit()
    revoked = []
    http.set_transport(httpx.MockTransport(lambda req: revoked.append(str(req.url)) or httpx.Response(200)))

    assert client.delete("/api/v1/me", headers=h).status_code == 204

    with new_session() as db:
        assert db.get(User, alice.id) is None
        for model in ENTITIES.values():
            assert db.scalar(select(func.count()).select_from(model).where(model.user_id == alice.id)) == 0
        assert db.scalar(select(func.count()).select_from(ENTITIES["GlucoseReading"])) == 1  # Bob's row stays
    assert get_storage().list_keys(f"users/{alice.id}/") == []
    assert revoked == ["https://api.fitbit.com/oauth2/revoke"]
    assert client.get("/api/v1/me", headers=h).status_code == 401
