"""Phase 3 rule: Apple Health readings reach AI prompts only with PrivacyConsent.extra.ai_processing = true."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GlucoseReading, PrivacyConsent, User

APPLE_HEALTH = "apple_health"


def ai_processing_allowed(db: Session, user: User) -> bool:
    consent = db.scalars(select(PrivacyConsent).where(PrivacyConsent.user_id == user.id)).first()
    extra = consent.extra if consent is not None else None
    return isinstance(extra, dict) and extra.get("ai_processing") is True


def glucose_scope(db: Session, user: User) -> list[Any]:
    """WHERE clauses for GlucoseReading rows an AI context builder may read for this user."""
    clauses: list[Any] = [GlucoseReading.user_id == user.id]
    if not ai_processing_allowed(db, user):
        clauses.append(GlucoseReading.source_device != APPLE_HEALTH)
    return clauses
