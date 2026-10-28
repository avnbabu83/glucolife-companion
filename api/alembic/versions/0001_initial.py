"""initial schema: users and the 10 health tables

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

HEALTH_TABLES = (
    "user_profiles", "glucose_readings", "meal_plans", "exercise_plans", "exercise_logs",
    "sleep_logs", "activity_data", "stress_logs", "privacy_consents", "medications",
)


def _ts(name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _health_table(name: str, *columns: sa.Column, constraints: tuple = (), date_index: bool = True) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        *columns,
        sa.Column("extra", JSONType, nullable=True),
        sa.Column("base44_id", sa.String(64), nullable=True),
        _ts("created_at", nullable=False),
        _ts("updated_at", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f(f"fk_{name}_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}")),
        sa.UniqueConstraint("base44_id", name=op.f(f"uq_{name}_base44_id")),
        *constraints,
    )
    op.create_index(op.f(f"ix_{name}_user_id"), name, ["user_id"], unique=False)
    if date_index:
        op.create_index(op.f(f"ix_{name}_date"), name, ["date"], unique=False)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("apple_sub", sa.String(255), nullable=True),
        sa.Column("google_sub", sa.String(255), nullable=True),
        sa.Column("apple_refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("weekly_insights_last_week", sa.String(10), nullable=True),
        sa.Column("ai_calls_date", sa.Date(), nullable=True),
        sa.Column("ai_calls_count", sa.Integer(), nullable=False),
        sa.Column("base44_id", sa.String(64), nullable=True),
        _ts("created_at", nullable=False),
        _ts("last_login_at"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("apple_sub", name=op.f("uq_users_apple_sub")),
        sa.UniqueConstraint("google_sub", name=op.f("uq_users_google_sub")),
        sa.UniqueConstraint("base44_id", name=op.f("uq_users_base44_id")),
    )

    _health_table(
        "user_profiles",
        sa.Column("diabetes_type", sa.String(50)),
        sa.Column("dietary_preference", sa.String(50)),
        sa.Column("gender", sa.String(30)),
        sa.Column("age", sa.Integer()),
        sa.Column("weight", sa.Float()),
        sa.Column("height", sa.Float()),
        sa.Column("activity_level", sa.String(50)),
        sa.Column("wake_time", sa.String(5)),
        sa.Column("sleep_time", sa.String(5)),
        sa.Column("target_glucose_min", sa.Integer()),
        sa.Column("target_glucose_max", sa.Integer()),
        sa.Column("allergies", JSONType),
        sa.Column("daily_routine", sa.Text()),
        sa.Column("libre_email", sa.String(320)),
        sa.Column("libre_password_enc", sa.Text()),
        sa.Column("libre_region", sa.String(20)),
        sa.Column("fitbit_access_token_enc", sa.Text()),
        sa.Column("fitbit_refresh_token_enc", sa.Text()),
        _ts("fitbit_token_expires_at"),
        constraints=(sa.UniqueConstraint("user_id", name="uq_user_profiles_user_id"),),
        date_index=False,
    )
    _health_table(
        "glucose_readings",
        sa.Column("reading", sa.Float(), nullable=False),
        sa.Column("date", sa.Date()),
        _ts("date_time"),
        sa.Column("reading_time", sa.String(5)),
        sa.Column("context", sa.String(30)),
        sa.Column("trend", sa.String(20)),
        sa.Column("source_device", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(100)),
        constraints=(
            sa.UniqueConstraint("user_id", "source_device", "external_id", name="uq_glucose_readings_source"),
        ),
    )
    _health_table(
        "meal_plans",
        sa.Column("date", sa.Date()),
        sa.Column("meal_type", sa.String(30)),
        sa.Column("meal_name", sa.String(200)),
        sa.Column("description", sa.Text()),
        sa.Column("ingredients", JSONType),
        sa.Column("calories", sa.Float()),
        sa.Column("carbs", sa.Float()),
        sa.Column("protein", sa.Float()),
        sa.Column("fat", sa.Float()),
        sa.Column("fiber", sa.Float()),
        sa.Column("glycemic_index", sa.String(10)),
        sa.Column("scheduled_time", sa.String(5)),
        sa.Column("is_completed", sa.Boolean(), nullable=False),
        sa.Column("pre_meal_glucose", sa.Float()),
        sa.Column("post_meal_glucose", sa.Float()),
        sa.Column("notes", sa.Text()),
        sa.Column("image_file_key", sa.String(300)),
    )
    _health_table(
        "exercise_plans",
        sa.Column("date", sa.Date()),
        sa.Column("exercise_name", sa.String(200)),
        sa.Column("exercise_type", sa.String(50)),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("intensity", sa.String(20)),
        sa.Column("scheduled_time", sa.String(5)),
        sa.Column("scheduled_days", JSONType),
        sa.Column("calories_burned", sa.Float()),
        sa.Column("precautions", sa.Text()),
        sa.Column("is_completed", sa.Boolean(), nullable=False),
    )
    _health_table(
        "exercise_logs",
        sa.Column("exercise_name", sa.String(200)),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("actual_duration", sa.Integer()),
        sa.Column("calories_burned", sa.Float()),
        sa.Column("pre_exercise_glucose", sa.Float()),
        sa.Column("post_exercise_glucose", sa.Float()),
        sa.Column("date", sa.Date()),
        _ts("date_time"),
    )
    _health_table(
        "sleep_logs",
        sa.Column("date", sa.Date()),
        sa.Column("quality", sa.String(20)),
        sa.Column("sleep_start_time", sa.String(32)),
        sa.Column("sleep_end_time", sa.String(32)),
        sa.Column("bedtime", sa.String(5)),
        sa.Column("wake_time", sa.String(5)),
        sa.Column("total_hours", sa.Float()),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("source", sa.String(30)),
        sa.Column("external_id", sa.String(100)),
        constraints=(sa.UniqueConstraint("user_id", "source", "external_id", name="uq_sleep_logs_source"),),
    )
    _health_table(
        "activity_data",
        sa.Column("date", sa.Date()),
        sa.Column("steps", sa.Integer()),
        sa.Column("calories", sa.Float()),
        sa.Column("active_minutes", sa.Integer()),
        sa.Column("resting_heart_rate", sa.Integer()),
        sa.Column("source", sa.String(30)),
        constraints=(sa.UniqueConstraint("user_id", "source", "date", name="uq_activity_data_source_date"),),
    )
    _health_table(
        "stress_logs",
        sa.Column("date", sa.Date()),
        sa.Column("stress_level", sa.Integer()),
        sa.Column("notes", sa.Text()),
    )
    _health_table(
        "privacy_consents",
        sa.Column("location", sa.Boolean()),
        sa.Column("cgm", sa.Boolean()),
        sa.Column("wearables", sa.Boolean()),
        sa.Column("email", sa.Boolean(), nullable=False),
        _ts("consented_at"),
        date_index=False,
    )
    _health_table(
        "medications",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("dosage", sa.String(100)),
        sa.Column("schedule_times", JSONType),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        date_index=False,
    )


def downgrade() -> None:
    for name in reversed(HEALTH_TABLES):
        op.drop_table(name)
    op.drop_table("users")
