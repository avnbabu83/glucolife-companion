"""SQLAlchemy models: the users table plus the 10 health tables.

Every health table has a user_id foreign key with ON DELETE CASCADE, a
base44_id for the re-runnable Base44 copy, and an `extra` JSON column for
Base44 fields that are not yet promoted to typed columns.
Columns whose name ends in `_enc` hold encrypted credentials and are never
exposed through the API.
"""

from __future__ import annotations

import uuid
from datetime import date as _date
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

JSONType = JSON().with_variant(postgresql.JSONB(), "postgresql")

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    apple_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    apple_refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    weekly_insights_last_week: Mapped[str | None] = mapped_column(String(10))
    ai_calls_date: Mapped[_date | None] = mapped_column(Date)
    ai_calls_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    base44_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HealthRecord:
    """Columns shared by the 10 health tables."""

    # Fields readable through the API but only writable by server code.
    __readonly__: tuple[str, ...] = ()
    # Fields never returned or accepted by the generic entity API.
    __hidden__: tuple[str, ...] = ()
    # Fields required when creating a row.
    __required__: tuple[str, ...] = ()

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)

    @declared_attr
    def user_id(cls) -> Mapped[str]:
        return mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    base44_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class UserProfile(HealthRecord, Base):
    __tablename__ = "user_profiles"
    __readonly__ = ("libre_email", "libre_region", "dexcom_last_sync_at")
    __hidden__ = ("fitbit_token_expires_at", "dexcom_token_expires_at")
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_profiles_user_id"),)

    diabetes_type: Mapped[str | None] = mapped_column(String(50))
    dietary_preference: Mapped[str | None] = mapped_column(String(50))
    gender: Mapped[str | None] = mapped_column(String(30))
    age: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[float | None] = mapped_column(Float)
    height: Mapped[float | None] = mapped_column(Float)
    activity_level: Mapped[str | None] = mapped_column(String(50))
    wake_time: Mapped[str | None] = mapped_column(String(5))
    sleep_time: Mapped[str | None] = mapped_column(String(5))
    target_glucose_min: Mapped[int | None] = mapped_column(Integer)
    target_glucose_max: Mapped[int | None] = mapped_column(Integer)
    allergies: Mapped[list[Any] | None] = mapped_column(JSONType)
    daily_routine: Mapped[str | None] = mapped_column(Text)
    libre_email: Mapped[str | None] = mapped_column(String(320))
    libre_password_enc: Mapped[str | None] = mapped_column(Text)
    libre_region: Mapped[str | None] = mapped_column(String(20))
    fitbit_access_token_enc: Mapped[str | None] = mapped_column(Text)
    fitbit_refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    fitbit_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Phase 4 (alembic 0003_dexcom)
    dexcom_access_token_enc: Mapped[str | None] = mapped_column(Text)
    dexcom_refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    dexcom_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dexcom_last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GlucoseReading(HealthRecord, Base):
    __tablename__ = "glucose_readings"
    __required__ = ("reading",)
    __table_args__ = (
        UniqueConstraint("user_id", "source_device", "external_id", name="uq_glucose_readings_source"),
    )

    reading: Mapped[float] = mapped_column(Float, nullable=False)
    date: Mapped[_date | None] = mapped_column(Date, index=True)
    date_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reading_time: Mapped[str | None] = mapped_column(String(5))
    context: Mapped[str | None] = mapped_column(String(30))
    trend: Mapped[str | None] = mapped_column(String(20))
    source_device: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(100))


class MealPlan(HealthRecord, Base):
    __tablename__ = "meal_plans"

    date: Mapped[_date | None] = mapped_column(Date, index=True)
    meal_type: Mapped[str | None] = mapped_column(String(30))
    meal_name: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    ingredients: Mapped[list[Any] | None] = mapped_column(JSONType)
    calories: Mapped[float | None] = mapped_column(Float)
    carbs: Mapped[float | None] = mapped_column(Float)
    protein: Mapped[float | None] = mapped_column(Float)
    fat: Mapped[float | None] = mapped_column(Float)
    fiber: Mapped[float | None] = mapped_column(Float)
    glycemic_index: Mapped[str | None] = mapped_column(String(10))
    scheduled_time: Mapped[str | None] = mapped_column(String(5))
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pre_meal_glucose: Mapped[float | None] = mapped_column(Float)
    post_meal_glucose: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    image_file_key: Mapped[str | None] = mapped_column(String(300))


class ExercisePlan(HealthRecord, Base):
    __tablename__ = "exercise_plans"

    date: Mapped[_date | None] = mapped_column(Date, index=True)
    exercise_name: Mapped[str | None] = mapped_column(String(200))
    exercise_type: Mapped[str | None] = mapped_column(String(50))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    intensity: Mapped[str | None] = mapped_column(String(20))
    scheduled_time: Mapped[str | None] = mapped_column(String(5))
    scheduled_days: Mapped[list[Any] | None] = mapped_column(JSONType)
    calories_burned: Mapped[float | None] = mapped_column(Float)
    precautions: Mapped[str | None] = mapped_column(Text)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ExerciseLog(HealthRecord, Base):
    __tablename__ = "exercise_logs"

    exercise_name: Mapped[str | None] = mapped_column(String(200))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    actual_duration: Mapped[int | None] = mapped_column(Integer)
    calories_burned: Mapped[float | None] = mapped_column(Float)
    pre_exercise_glucose: Mapped[float | None] = mapped_column(Float)
    post_exercise_glucose: Mapped[float | None] = mapped_column(Float)
    date: Mapped[_date | None] = mapped_column(Date, index=True)
    date_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SleepLog(HealthRecord, Base):
    __tablename__ = "sleep_logs"
    __table_args__ = (UniqueConstraint("user_id", "source", "external_id", name="uq_sleep_logs_source"),)

    date: Mapped[_date | None] = mapped_column(Date, index=True)
    quality: Mapped[str | None] = mapped_column(String(20))
    sleep_start_time: Mapped[str | None] = mapped_column(String(32))
    sleep_end_time: Mapped[str | None] = mapped_column(String(32))
    bedtime: Mapped[str | None] = mapped_column(String(5))
    wake_time: Mapped[str | None] = mapped_column(String(5))
    total_hours: Mapped[float | None] = mapped_column(Float)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(30), default="manual")
    external_id: Mapped[str | None] = mapped_column(String(100))


class ActivityData(HealthRecord, Base):
    __tablename__ = "activity_data"
    __table_args__ = (UniqueConstraint("user_id", "source", "date", name="uq_activity_data_source_date"),)

    date: Mapped[_date | None] = mapped_column(Date, index=True)
    steps: Mapped[int | None] = mapped_column(Integer)
    calories: Mapped[float | None] = mapped_column(Float)
    active_minutes: Mapped[int | None] = mapped_column(Integer)
    resting_heart_rate: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(30))


class StressLog(HealthRecord, Base):
    __tablename__ = "stress_logs"

    date: Mapped[_date | None] = mapped_column(Date, index=True)
    stress_level: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)


class PrivacyConsent(HealthRecord, Base):
    __tablename__ = "privacy_consents"

    location: Mapped[bool | None] = mapped_column(Boolean)
    cgm: Mapped[bool | None] = mapped_column(Boolean)
    wearables: Mapped[bool | None] = mapped_column(Boolean)
    email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Medication(HealthRecord, Base):
    __tablename__ = "medications"
    __required__ = ("name",)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dosage: Mapped[str | None] = mapped_column(String(100))
    schedule_times: Mapped[list[Any] | None] = mapped_column(JSONType)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


ENTITIES: dict[str, type[HealthRecord]] = {
    "UserProfile": UserProfile,
    "GlucoseReading": GlucoseReading,
    "MealPlan": MealPlan,
    "ExercisePlan": ExercisePlan,
    "ExerciseLog": ExerciseLog,
    "SleepLog": SleepLog,
    "ActivityData": ActivityData,
    "StressLog": StressLog,
    "PrivacyConsent": PrivacyConsent,
    "Medication": Medication,
}
