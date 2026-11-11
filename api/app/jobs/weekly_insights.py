"""Weekly insights email job.

    python -m app.jobs.weekly_insights [--dry-run] [--week 2025-W03]

For every user whose email consent is not off, builds the last 7 days of data,
asks Claude for the weekly-insights task, renders
app/templates/email/weekly_insights.txt.j2 and sends it (SES, SMTP or console).
The ISO week is recorded per user, so a retry or a re-run never sends twice.
A failure for one user is logged and the loop continues.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import tasks
from app.ai.client import AIUnavailable
from app.db import new_session
from app.email import EmailMessage, EmailSender, get_email_sender
from app.models import PrivacyConsent, User

log = logging.getLogger("diabeteasy.weekly_insights")

SUBJECT = "Your Weekly Diabetes Insights"
TEMPLATE = "email/weekly_insights.txt.j2"
TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "templates"),
    undefined=StrictUndefined,
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)


@dataclass
class Result:
    week: str
    sent: int = 0
    already_sent: int = 0
    no_consent: int = 0
    no_profile: int = 0
    failed: int = 0


def iso_week(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def render_email(name: str | None, insights: tasks.WeeklyInsightsOut) -> str:
    return TEMPLATES.get_template(TEMPLATE).render(
        name=name or "there",
        summary=insights.summary,
        achievements=insights.achievements,
        improvements=insights.improvements,
        action_items=insights.action_items,
    )


def email_allowed(db: Session, user: User) -> bool:
    consent = db.scalar(
        select(PrivacyConsent).where(PrivacyConsent.user_id == user.id).order_by(PrivacyConsent.created_at.desc())
    )
    return consent is None or consent.email is not False


def generate_insights(db: Session, user: User, attempts: int = 3, delay: float = 5.0) -> tasks.WeeklyInsightsOut:
    task = tasks.get_task("weekly-insights")
    context = task.build_context(db, user, tasks.EmptyIn())  # raises ProfileMissing
    prompt = tasks.render_prompt(task, context)
    for attempt in range(1, attempts + 1):
        try:
            result = tasks.generate(task, prompt)
            assert isinstance(result, tasks.WeeklyInsightsOut)
            return result
        except (AIUnavailable, tasks.AIInvalidReply):
            if attempt == attempts:
                raise
            time.sleep(delay * attempt)
    raise RuntimeError("unreachable")


def run(week: str | None = None, dry_run: bool = False, sender: EmailSender | None = None,
        attempts: int = 3, retry_delay: float = 5.0) -> Result:
    result = Result(week=week or iso_week(datetime.now(timezone.utc).date()))
    sender = sender or get_email_sender()
    with new_session() as db:
        user_ids = list(db.scalars(select(User.id).order_by(User.created_at)))

    for user_id in user_ids:
        with new_session() as db:
            user = db.get(User, user_id)
            if user is None:
                continue
            if user.weekly_insights_last_week == result.week:
                result.already_sent += 1
                continue
            if not email_allowed(db, user):
                result.no_consent += 1
                continue
            try:
                insights = generate_insights(db, user, attempts, retry_delay)
                body = render_email(user.full_name, insights)
                if dry_run:
                    print(f"--- {user.email} ---\n{body}")
                    continue
                sender.send(EmailMessage(to=user.email, subject=SUBJECT, body=body))
            except tasks.ProfileMissing:
                result.no_profile += 1
                continue
            except Exception:
                log.exception("Weekly insights failed for user %s", user.id)
                result.failed += 1
                continue
            user.weekly_insights_last_week = result.week
            db.commit()
            result.sent += 1
    log.info("Weekly insights finished: %s", asdict(result))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Send the weekly diabetes insights emails.")
    parser.add_argument("--week", help="ISO week to record, e.g. 2025-W03 (default: current week)")
    parser.add_argument("--dry-run", action="store_true", help="Print the emails instead of sending them")
    args = parser.parse_args(argv)
    result = run(week=args.week, dry_run=args.dry_run)
    print(asdict(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
