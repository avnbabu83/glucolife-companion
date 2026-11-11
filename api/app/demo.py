"""Demo account for previews (APP_ENV=preview only).

The demo user is created on first use with three days of realistic sample data:
glucose readings in mg/dL, meals and workouts. The data is fixed (no randomness)
so every preview shows the same believable day.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExerciseLog, GlucoseReading, MealPlan, User, utcnow

DEMO_EMAIL = "demo@preview.diabeteasy.local"
DEMO_NAME = "Demo User"
DEMO_DAYS = 3

# (time, mg/dL, context) for one typical day.
_GLUCOSE_DAY = [
    ("07:00", 104, "fasting"), ("09:00", 152, "after_meal"), ("12:00", 112, "before_meal"),
    ("14:00", 168, "after_meal"), ("18:30", 118, "before_meal"), ("20:30", 145, "after_meal"),
    ("22:30", 121, "bedtime"),
]
# (meal_type, name, time, calories kcal, carbs g, protein g, fat g, fiber g)
_MEALS = [
    ("breakfast", "Greek yogurt with berries and walnuts", "07:30", 320, 28, 20, 14, 5),
    ("lunch", "Grilled chicken salad with quinoa", "12:30", 480, 38, 36, 18, 8),
    ("dinner", "Baked salmon, broccoli and brown rice", "19:00", 560, 45, 38, 22, 7),
]
# (name, minutes, kcal, pre mg/dL, post mg/dL, time)
_WORKOUTS = [
    ("Brisk walk", 30, 140, 150, 118, "17:30"),
    ("Cycling", 40, 280, 160, 115, "17:30"),
    ("Strength training", 35, 190, 142, 120, "17:30"),
]


def get_or_create_demo_user(db: Session) -> User:
    """Return the demo user, creating it and its sample data on first use."""
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is not None:
        return user
    user = User(email=DEMO_EMAIL, full_name=DEMO_NAME)
    db.add(user)
    db.flush()
    today = date.today()
    for offset in range(DEMO_DAYS):
        day = today - timedelta(days=offset)
        for i, (hhmm, mg_dl, context) in enumerate(_GLUCOSE_DAY):
            reading = mg_dl + (offset * 7 + i * 3) % 11 - 5  # small day-to-day variation
            when = datetime.combine(day, time.fromisoformat(hhmm), tzinfo=timezone.utc)
            db.add(GlucoseReading(
                user_id=user.id, reading=float(reading), date=day, date_time=when,
                reading_time=hhmm, context=context, source_device="manual",
            ))
        for meal_type, name, hhmm, kcal, carbs, protein, fat, fiber in _MEALS:
            db.add(MealPlan(
                user_id=user.id, date=day, meal_type=meal_type, meal_name=name, scheduled_time=hhmm,
                calories=kcal, carbs=carbs, protein=protein, fat=fat, fiber=fiber,
                is_completed=offset > 0,
            ))
        name, minutes, kcal, pre, post, hhmm = _WORKOUTS[offset % len(_WORKOUTS)]
        db.add(ExerciseLog(
            user_id=user.id, exercise_name=name, duration_minutes=minutes, actual_duration=minutes,
            calories_burned=kcal, pre_exercise_glucose=pre, post_exercise_glucose=post, date=day,
            date_time=datetime.combine(day, time.fromisoformat(hhmm), tzinfo=timezone.utc),
        ))
    user.last_login_at = utcnow()
    db.commit()
    return user
