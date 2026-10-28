"""POST /api/v1/glucose/import: batch import of Apple Health blood glucose from the iPhone app (Phase 3)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import GlucoseReading, PrivacyConsent, User

SOURCE = "apple_health"
MIN_MG_DL, MAX_MG_DL = 20, 600
FUTURE_TOLERANCE = timedelta(minutes=10)

log = logging.getLogger("app.glucose")
router = APIRouter(prefix="/api/v1/glucose", tags=["glucose"])


class GlucoseSample(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_id: str = Field(min_length=1, max_length=64)
    reading_mg_dl: float
    date_time: AwareDatetime
    source_app: str | None = Field(default=None, max_length=255)


class GlucoseImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    samples: list[GlucoseSample] = Field(min_length=1, max_length=500)


class GlucoseImportOut(BaseModel):
    received: int
    imported: int
    duplicates: int
    rejected: int


@router.post("/import", response_model=GlucoseImportOut,
             responses={403: {"description": "Wearables consent required: { error: 'consent_required' }"}})
def import_glucose(body: GlucoseImportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    consent = db.scalars(select(PrivacyConsent).where(PrivacyConsent.user_id == user.id)).first()
    if consent is None or consent.wearables is not True:
        return JSONResponse(status_code=403, content={"error": "consent_required"})

    limit = datetime.now(timezone.utc) + FUTURE_TOLERANCE
    accepted: dict[str, GlucoseSample] = {}
    rejected = 0
    for s in body.samples:
        if not (MIN_MG_DL <= s.reading_mg_dl <= MAX_MG_DL) or s.date_time > limit:
            rejected += 1
        elif s.external_id not in accepted:
            accepted[s.external_id] = s

    existing: set[str] = set()
    if accepted:
        existing = set(db.scalars(select(GlucoseReading.external_id).where(
            GlucoseReading.user_id == user.id, GlucoseReading.source_device == SOURCE,
            GlucoseReading.external_id.in_(list(accepted)))))
    new = [s for key, s in accepted.items() if key not in existing]
    for s in new:
        db.add(GlucoseReading(
            user_id=user.id, source_device=SOURCE, external_id=s.external_id, reading=s.reading_mg_dl,
            date_time=s.date_time, date=s.date_time.date(), reading_time=s.date_time.strftime("%H:%M"),
            extra={"source_app": s.source_app} if s.source_app else {},
        ))
    db.commit()

    out = GlucoseImportOut(received=len(body.samples), imported=len(new),
                           duplicates=len(body.samples) - rejected - len(new), rejected=rejected)
    log.info("glucose import user=%s received=%d imported=%d duplicates=%d rejected=%d",
             user.id, out.received, out.imported, out.duplicates, out.rejected)
    return out
