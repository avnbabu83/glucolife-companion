"""Phase 2 card tasks: input/output schemas and user-scoped context builders.

The statistics are computed here in Python (ported from the prompts the web
components used to build in the browser); Claude only writes the narrative.
Every query is filtered by the caller's user_id (glucose via glucose_scope).
Output schemas follow the fields each React card renders.
"""

from __future__ import annotations

from datetime import date as _date
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.ai.healthkit import glucose_scope
from app.integrations.profile import get_profile
from app.models import ActivityData, ExerciseLog, GlucoseReading, MealPlan, SleepLog, StressLog, User


class InsufficientData(Exception):
    """Not enough of the user's own data for this analysis (returned as 422 insufficient_data)."""


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- inputs ----------

class GlucoseTrendsIn(_In):
    days: int = Field(14, ge=7, le=90)


class EmptyCardIn(_In):
    pass


class RoutineIn(_In):
    routine: str = Field(..., min_length=1, max_length=4000)


class NutritionComparisonIn(_In):
    date: _date


class JournalIn(_In):
    text: str = Field("", max_length=4000)


class DescriptionIn(_In):
    description: str = Field(..., min_length=1, max_length=500)


# ---------- outputs ----------

class DietaryRecommendation(BaseModel):
    change: str
    reason: str = ""
    priority: Literal["high", "medium", "low"] = "medium"


class GlucoseTrendsOut(BaseModel):
    overall_control: Literal["excellent", "good", "needs_improvement", "poor"]
    patterns_identified: list[str] = []
    dietary_recommendations: list[DietaryRecommendation] = []
    meal_timing_suggestions: list[str] = []
    priority_actions: list[str] = []


class RecommendationsOut(BaseModel):
    patterns: list[str] = []
    diet_recommendations: list[str] = []
    timing_suggestions: list[str] = []
    foods_to_include: list[str] = []
    foods_to_avoid: list[str] = []
    exercise_tips: list[str] = []
    alert: str = ""


class ScheduleItem(BaseModel):
    time: str
    activity: str
    category: Literal["meal", "exercise", "work", "commute", "rest"]


class RiskFactor(BaseModel):
    risk: str
    severity: Literal["high", "medium", "low"]
    impact: str = ""


class MealRecommendation(BaseModel):
    meal: str
    suggested_time: str = ""
    reasoning: str = ""
    meal_ideas: list[str] = []


class ExerciseOpportunity(BaseModel):
    when: str = ""
    activity: str
    duration: str = ""
    how_to_fit: str = ""


class PriorityChange(BaseModel):
    change: str
    why: str = ""
    how: str = ""
    priority: int = 1


class RoutineOut(BaseModel):
    schedule_breakdown: list[ScheduleItem] = []
    risk_factors: list[RiskFactor] = []
    meal_recommendations: list[MealRecommendation] = []
    exercise_opportunities: list[ExerciseOpportunity] = []
    priority_changes: list[PriorityChange] = []


class NutritionComparisonOut(BaseModel):
    adherence_percentage: float
    key_differences: list[str] = []
    recommendations: list[str] = []
    overall_assessment: str


class DailyTrendOut(BaseModel):
    is_positive: bool
    message: str
    tip: str


class MealMention(BaseModel):
    description: str
    meal_type: str = ""
    should_log: bool = False


class ExerciseMention(BaseModel):
    description: str
    duration_estimate: float = 0
    should_log: bool = False


class JournalOut(BaseModel):
    summary: str
    meals_mentioned: list[MealMention] = []
    exercises_mentioned: list[ExerciseMention] = []
    glucose_impact: str = ""
    tips: list[str] = []


class FoodNutritionOut(BaseModel):
    calories: float
    carbs: float
    protein: float
    fat: float
    fiber: float = 0
    glycemic_index: Literal["low", "medium", "high"]


EXERCISE_TYPES = Literal[
    "walking", "jogging", "running", "cycling", "swimming", "yoga", "pilates", "strength_training",
    "weight_lifting", "hiit", "stretching", "dance", "aerobics", "tennis", "badminton", "basketball",
    "football", "golf", "rowing", "elliptical", "stair_climbing", "boxing", "martial_arts", "gym_workout", "other",
]


class WorkoutEstimateOut(BaseModel):
    exercise_type: EXERCISE_TYPES
    duration_minutes: float
    calories_burned: float
    intensity: Literal["low", "moderate", "high"]


# ---------- helpers ----------

def _avg(values: list[float]) -> int | None:
    return round(sum(values) / len(values)) if values else None


def _today() -> _date:
    return datetime.now(timezone.utc).date()


def _since(model, days: int):
    """Rows dated within the last `days` days (undated rows by created_at)."""
    since_date = _today() - timedelta(days=days)
    since_dt = datetime.now(timezone.utc) - timedelta(days=days)
    return or_(model.date > since_date, and_(model.date.is_(None), model.created_at >= since_dt))


def _x(row, key: str):
    extra = row.extra if isinstance(row.extra, dict) else {}
    return extra.get(key)


def profile_view(db: Session, user: User) -> dict[str, Any]:
    """The user's profile with the defaults the web cards used (no name or email)."""
    p = get_profile(db, user)

    def get(attr, default=None):
        value = getattr(p, attr, None) if p is not None else None
        return default if value in (None, "", []) else value

    weight, height = get("weight"), get("height")
    bmi = round(weight / (height / 100) ** 2, 1) if weight and height else None
    return {
        "diabetes_type": get("diabetes_type", "type 2"),
        "dietary_preference": get("dietary_preference", "omnivore"),
        "activity_level": get("activity_level", "moderate"),
        "age": get("age", "N/A"),
        "weight": weight or "N/A",
        "height": height or "N/A",
        "bmi": bmi or "N/A",
        "allergies": get("allergies", []),
        "target_min": get("target_glucose_min", 70),
        "target_max": get("target_glucose_max", 140),
    }


def _readings(db: Session, user: User, days: int, limit: int = 1000) -> list[GlucoseReading]:
    return list(db.scalars(
        select(GlucoseReading).where(*glucose_scope(db, user), _since(GlucoseReading, days))
        .order_by(GlucoseReading.date.desc(), GlucoseReading.created_at.desc()).limit(limit)
    ))


def _rows(db: Session, model, user: User, *where, limit: int = 200, order=None):
    stmt = select(model).where(model.user_id == user.id, *where)
    stmt = stmt.order_by(*(order if order is not None else (model.date.desc(), model.created_at.desc())))
    return list(db.scalars(stmt.limit(limit)))


def _glucose_stats(values: list[float], tmin: float, tmax: float) -> dict[str, Any]:
    n = len(values)
    high = sum(1 for v in values if v > tmax)
    low = sum(1 for v in values if v < tmin)
    in_range = sum(1 for v in values if tmin <= v <= tmax)
    return {
        "count": n,
        "average": _avg(values),
        "high": high,
        "low": low,
        "high_pct": round(high * 100 / n) if n else 0,
        "low_pct": round(low * 100 / n) if n else 0,
        "time_in_range": round(in_range * 100 / n) if n else None,
    }


# ---------- context builders ----------

def glucose_trends_context(db: Session, user: User, inputs: GlucoseTrendsIn) -> dict[str, Any]:
    profile = profile_view(db, user)
    readings = _readings(db, user, inputs.days)
    if len(readings) < 10:
        raise InsufficientData()
    meals = _rows(db, MealPlan, user, MealPlan.is_completed.is_(True), _since(MealPlan, inputs.days), limit=500)
    stats = _glucose_stats([r.reading for r in readings], profile["target_min"], profile["target_max"])

    def meal_avg(attr):
        return round(sum(getattr(m, attr) or 0 for m in meals) / len(meals)) if meals else 0

    return {
        "profile": profile,
        "days": inputs.days,
        "glucose": stats,
        "meals": {"count": len(meals), "carbs": meal_avg("carbs"), "protein": meal_avg("protein"),
                  "fiber": meal_avg("fiber")},
    }


def glucose_trends_shape(out: GlucoseTrendsOut, ctx: dict[str, Any]) -> dict[str, Any]:
    g, m = ctx["glucose"], ctx["meals"]
    return {
        **out.model_dump(),
        "stats": {
            "avgGlucose": g["average"], "timeInRange": g["time_in_range"], "highReadings": g["high"],
            "lowReadings": g["low"], "totalReadings": g["count"], "avgCarbs": m["carbs"],
            "avgProtein": m["protein"], "avgFiber": m["fiber"], "mealsLogged": m["count"],
        },
    }


def recommendations_context(db: Session, user: User, inputs: EmptyCardIn) -> dict[str, Any]:
    profile = profile_view(db, user)
    readings = _readings(db, user, 7)
    stats = _glucose_stats([r.reading for r in readings], profile["target_min"], profile["target_max"])
    meals = _rows(db, MealPlan, user, limit=10)
    exercise = _rows(db, ExerciseLog, user, limit=7)
    sleep = _rows(db, SleepLog, user, _since(SleepLog, 7), limit=7)
    activity = _rows(db, ActivityData, user, _since(ActivityData, 7), limit=7)
    stress = _rows(db, StressLog, user, _since(StressLog, 7), limit=7)
    return {
        "profile": profile,
        "glucose": stats,
        "readings": [
            {"value": round(r.reading), "time": r.reading_time or "N/A", "context": r.context or "random",
             "trend": r.trend or "stable"} for r in readings[:20]
        ],
        "meals": [
            {"name": m.meal_name or "Meal", "type": m.meal_type or "meal", "carbs": m.carbs, "calories": m.calories,
             "gi": m.glycemic_index or "N/A", "logged": m.is_completed} for m in meals
        ],
        "exercise": [
            {"name": e.exercise_name or "Exercise", "minutes": e.actual_duration or e.duration_minutes or "N/A",
             "pre": e.pre_exercise_glucose or "N/A", "post": e.post_exercise_glucose or "N/A",
             "felt": _x(e, "how_felt") or "N/A"} for e in exercise
        ],
        "sleep": [
            {"date": s.date or "N/A",
             "hours": s.total_hours or (round(s.duration_minutes / 60, 1) if s.duration_minutes else "N/A"),
             "quality": s.quality or "N/A", "deep": _x(s, "deep_sleep_minutes") or "N/A",
             "morning_glucose": _x(s, "morning_glucose") or "N/A"} for s in sleep
        ],
        "activity": [
            {"date": a.date or "N/A", "steps": a.steps or 0, "active": a.active_minutes or 0,
             "calories": a.calories or _x(a, "calories_burned") or 0,
             "hr": _x(a, "heart_rate_avg") or a.resting_heart_rate or "N/A"} for a in activity
        ],
        "stress": [{"date": s.date or "N/A", "level": s.stress_level, "notes": s.notes or ""} for s in stress],
    }


def routine_context(db: Session, user: User, inputs: RoutineIn) -> dict[str, Any]:
    return {"profile": profile_view(db, user), "routine": inputs.routine}


def _totals(meals: list[MealPlan]) -> dict[str, int]:
    return {k: round(sum(getattr(m, k) or 0 for m in meals)) for k in ("calories", "carbs", "protein", "fat", "fiber")}


def nutrition_comparison_context(db: Session, user: User, inputs: NutritionComparisonIn) -> dict[str, Any]:
    meals = _rows(db, MealPlan, user, MealPlan.date == inputs.date, limit=100)
    eaten = [m for m in meals if m.is_completed]
    if not eaten:
        raise InsufficientData()
    return {
        "profile": profile_view(db, user),
        "date": inputs.date.isoformat(),
        "planned": {"count": len(meals), **_totals(meals)},
        "eaten": {"count": len(eaten), **_totals(eaten)},
    }


def daily_trend_context(db: Session, user: User, inputs: EmptyCardIn) -> dict[str, Any]:
    today = _today()
    readings = _readings(db, user, 7)
    dated = [r for r in readings if r.date is not None]
    last3 = [r.reading for r in dated if r.date > today - timedelta(days=3)]
    prev4 = [r.reading for r in dated if today - timedelta(days=7) <= r.date <= today - timedelta(days=3)]
    if len(last3) < 5 or len(prev4) < 5:
        raise InsufficientData()
    avg_last3, avg_prev4 = sum(last3) / len(last3), sum(prev4) / len(prev4)
    trend = avg_last3 - avg_prev4
    meals = _rows(db, MealPlan, user, MealPlan.is_completed.is_(True), _since(MealPlan, 7), limit=200)
    exercise = [e for e in _rows(db, ExerciseLog, user, _since(ExerciseLog, 7), limit=200)
                if _x(e, "status") == "completed"]
    return {
        "profile": profile_view(db, user),
        "avg_last3": round(avg_last3),
        "avg_prev4": round(avg_prev4),
        "trend": round(trend),
        "trend_raw": trend,
        "trend_pct": f"{trend / avg_prev4 * 100:.1f}",
        "meals_count": len(meals),
        "meals_avg_carbs": round(sum(m.carbs or 0 for m in meals) / len(meals)) if meals else 0,
        "workouts": len(exercise),
    }


def daily_trend_shape(out: DailyTrendOut, ctx: dict[str, Any]) -> dict[str, Any]:
    return {**out.model_dump(), "trend": ctx["trend_raw"], "trendPercentage": ctx["trend_pct"],
            "avgLast3": ctx["avg_last3"], "avgPrevious4": ctx["avg_prev4"]}


def journal_context(db: Session, user: User, inputs: JournalIn) -> dict[str, Any]:
    profile = profile_view(db, user)
    readings = list(db.scalars(
        select(GlucoseReading).where(*glucose_scope(db, user), GlucoseReading.date == _today())
    ))
    readings.sort(key=lambda r: r.reading_time or "")
    return {
        "profile": profile,
        "text": inputs.text,
        "has_image": False,  # set by the router when file_keys are sent
        "readings": [{"time": r.reading_time or "N/A", "value": round(r.reading), "context": r.context or ""}
                     for r in readings],
        "average": _avg([r.reading for r in readings]),
        "target_min": profile["target_min"],
        # The journal card used 180 as its upper default (others use 140).
        "target_max": getattr(get_profile(db, user), "target_glucose_max", None) or 180,
    }


def description_context(db: Session, user: User, inputs: DescriptionIn) -> dict[str, Any]:
    return {"description": inputs.description}
