"""Server-defined AI tasks.

Each task has an input schema, a Jinja2 prompt template in app/ai/prompts/, a
context builder that loads the user's own data, and an output schema the reply
must match. Clients can only pick a task and pass its structured inputs, so
the Claude key cannot be used as an open proxy.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.ai import context as cards
from app.ai.client import get_ai_client
from app.ai.healthkit import glucose_scope
from app.integrations.profile import get_profile
from app.models import ExerciseLog, GlucoseReading, MealPlan, SleepLog, User

PROMPTS = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "prompts"),
    undefined=StrictUndefined,
    keep_trailing_newline=True,
    autoescape=False,
)

SYSTEM_PROMPT = (
    "You are the assistant inside DiabetEasy, a diabetes self-management app. "
    "Your output supports, and never replaces, advice from the user's healthcare team. "
    "Reply with a single JSON object and nothing else. It must match this JSON schema:\n{schema}"
)


class TaskNotFound(Exception):
    pass


class ProfileMissing(Exception):
    pass


class AIInvalidReply(Exception):
    pass


# ---------- input and output schemas ----------

class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MealPlanIn(_In):
    days: int = Field(3, ge=1, le=14)
    targetCalories: int = Field(1800, ge=800, le=5000)
    # Phase 2 (optional, additive): ISO 4217 code for the profile's weekly_food_budget.
    currency: str | None = Field(None, pattern=r"^[A-Z]{3}$")


class EmptyIn(_In):
    pass


class Meal(BaseModel):
    meal_type: str
    scheduled_time: str
    meal_name: str
    description: str = ""
    portion_size: str = ""
    ingredients: list[str] = []
    calories: float
    carbs: float
    protein: float
    fat: float
    fiber: float = 0
    glycemic_index: str = "medium"


class MealDay(BaseModel):
    day: int
    meals: list[Meal]


class MealPlanOut(BaseModel):
    days: list[MealDay]
    insights: str


class Exercise(BaseModel):
    name: str
    exercise_type: str
    duration_minutes: float
    intensity: str
    scheduled_days: list[str]
    scheduled_time: str
    calories_burned: float = 0
    precautions: str = ""


class ExercisePlanOut(BaseModel):
    exercises: list[Exercise]
    insights: str


class WeeklyInsightsOut(BaseModel):
    summary: str
    achievements: list[str] = []
    improvements: list[str] = []
    action_items: list[str] = []


class FoodPhotoOut(BaseModel):
    food_name: str
    description: str = ""
    calories: float
    carbs: float
    protein: float
    fat: float
    fiber: float = 0
    meal_type: Literal["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "evening_snack"]
    glycemic_index: Literal["low", "medium", "high"]


# ---------- context builders (user-scoped queries only) ----------

def _avg(values: list[float]) -> int | None:
    return round(sum(values) / len(values)) if values else None


def _hour(r: GlucoseReading) -> int | None:
    if r.reading_time:
        try:
            return int(r.reading_time.split(":")[0])
        except ValueError:
            return None
    return r.date_time.hour if r.date_time else None


def _recent_readings(db: Session, user: User, limit: int = 200) -> list[GlucoseReading]:
    return list(db.scalars(
        select(GlucoseReading).where(*glucose_scope(db, user))
        .order_by(GlucoseReading.created_at.desc()).limit(limit)
    ))


def _require_profile(db: Session, user: User):
    profile = get_profile(db, user)
    if profile is None:
        raise ProfileMissing()
    return profile


def meal_plan_context(db: Session, user: User, inputs: MealPlanIn) -> dict[str, Any]:
    profile = _require_profile(db, user)
    readings = _recent_readings(db, user)
    meals = list(db.scalars(
        select(MealPlan).where(MealPlan.user_id == user.id).order_by(MealPlan.created_at.desc()).limit(50)
    ))
    tmin, tmax = profile.target_glucose_min or 70, profile.target_glucose_max or 140
    values = [r.reading for r in readings]
    with_glucose = [m for m in meals if m.pre_meal_glucose and m.post_meal_glucose]
    budget = (profile.extra or {}).get("weekly_food_budget") if isinstance(profile.extra, dict) else None
    return {
        "profile": profile,
        "days": inputs.days,
        "target_calories": inputs.targetCalories,
        "budget": {"weekly": budget, "currency": inputs.currency} if budget and inputs.currency else None,
        "glucose": {
            "count": len(values),
            "average": _avg(values),
            "high": sum(1 for v in values if v > tmax),
            "low": sum(1 for v in values if v < tmin),
        },
        "meal_impacts": [
            {"name": m.meal_name, "spike": round(m.post_meal_glucose - m.pre_meal_glucose),
             "carbs": m.carbs, "glycemic_index": m.glycemic_index}
            for m in with_glucose[:10]
        ],
        "meal_data_points": len(with_glucose),
    }


def exercise_plan_context(db: Session, user: User, inputs: EmptyIn) -> dict[str, Any]:
    profile = _require_profile(db, user)
    readings = _recent_readings(db, user)
    logs = list(db.scalars(
        select(ExerciseLog).where(ExerciseLog.user_id == user.id).order_by(ExerciseLog.created_at.desc()).limit(50)
    ))
    hours = [(r.reading, _hour(r)) for r in readings]
    with_glucose = [log for log in logs if log.pre_exercise_glucose and log.post_exercise_glucose]
    return {
        "profile": profile,
        "glucose": {
            "count": len(readings),
            "average": _avg([r.reading for r in readings]),
            "morning": _avg([v for v, h in hours if h is not None and 6 <= h < 12]),
            "evening": _avg([v for v, h in hours if h is not None and 17 <= h < 22]),
        },
        "exercise_impacts": [
            {"name": log.exercise_name, "duration": log.actual_duration or log.duration_minutes,
             "change": round(log.post_exercise_glucose - log.pre_exercise_glucose)}
            for log in with_glucose[:10]
        ],
        "exercise_data_points": len(with_glucose),
    }


def weekly_insights_context(db: Session, user: User, inputs: EmptyIn) -> dict[str, Any]:
    profile = _require_profile(db, user)
    now = datetime.now(timezone.utc)
    since_dt, since_date = now - timedelta(days=7), (now - timedelta(days=7)).date()

    def last_week(model):
        return or_(model.date >= since_date, and_(model.date.is_(None), model.created_at >= since_dt))

    readings = list(db.scalars(
        select(GlucoseReading).where(*glucose_scope(db, user), last_week(GlucoseReading))
        .order_by(GlucoseReading.created_at.desc()).limit(50)
    ))
    meals_logged = len(list(db.scalars(
        select(MealPlan.id).where(MealPlan.user_id == user.id, MealPlan.is_completed.is_(True), last_week(MealPlan))
    )))
    sleep = db.scalar(
        select(SleepLog).where(SleepLog.user_id == user.id, last_week(SleepLog)).order_by(SleepLog.created_at.desc())
    )
    return {
        "profile": profile,
        "readings": [round(r.reading) for r in readings],
        "average": _avg([r.reading for r in readings]),
        "meals_logged": meals_logged,
        "sleep_quality": sleep.quality if sleep and sleep.quality else "N/A",
    }


def no_context(db: Session, user: User, inputs: EmptyIn) -> dict[str, Any]:
    return {}


# ---------- task registry ----------

@dataclass
class Task:
    name: str
    template: str
    input_model: type[_In]
    output_model: type[BaseModel]
    build_context: Callable[[Session, User, Any], dict[str, Any]]
    shape: Callable[[Any, dict[str, Any]], dict[str, Any]]
    images: Literal["none", "optional", "required"] = "none"


def _dump(out: BaseModel, ctx: dict[str, Any]) -> dict[str, Any]:
    return out.model_dump()


TASKS: dict[str, Task] = {
    "meal-plan": Task(
        "meal-plan", "meal_plan.j2", MealPlanIn, MealPlanOut, meal_plan_context,
        lambda out, ctx: {
            "success": True,
            "mealPlan": [d.model_dump() for d in out.days],
            "insights": out.insights,
            "glucoseDataPoints": ctx["glucose"]["count"],
            "mealDataPoints": ctx["meal_data_points"],
        },
    ),
    "exercise-plan": Task(
        "exercise-plan", "exercise_plan.j2", EmptyIn, ExercisePlanOut, exercise_plan_context,
        lambda out, ctx: {
            "success": True,
            "exercises": [e.model_dump() for e in out.exercises],
            "insights": out.insights,
            "glucoseDataPoints": ctx["glucose"]["count"],
            "exerciseDataPoints": ctx["exercise_data_points"],
        },
    ),
    "weekly-insights": Task(
        "weekly-insights", "weekly_insights.j2", EmptyIn, WeeklyInsightsOut, weekly_insights_context,
        lambda out, ctx: out.model_dump(),
    ),
    "food-photo": Task(
        "food-photo", "food_photo.j2", EmptyIn, FoodPhotoOut, no_context,
        lambda out, ctx: out.model_dump(), images="required",
    ),
    # ---- Phase 2: the web insight and logging cards (no browser-built prompts any more) ----
    "glucose-trends": Task(
        "glucose-trends", "glucose_trends.j2", cards.GlucoseTrendsIn, cards.GlucoseTrendsOut,
        cards.glucose_trends_context, cards.glucose_trends_shape,
    ),
    "recommendations": Task(
        "recommendations", "recommendations.j2", cards.EmptyCardIn, cards.RecommendationsOut,
        cards.recommendations_context, _dump,
    ),
    "routine-analysis": Task(
        "routine-analysis", "routine_analysis.j2", cards.RoutineIn, cards.RoutineOut, cards.routine_context, _dump,
    ),
    "nutrition-comparison": Task(
        "nutrition-comparison", "nutrition_comparison.j2", cards.NutritionComparisonIn,
        cards.NutritionComparisonOut, cards.nutrition_comparison_context, _dump,
    ),
    "daily-trend": Task(
        "daily-trend", "daily_trend.j2", cards.EmptyCardIn, cards.DailyTrendOut,
        cards.daily_trend_context, cards.daily_trend_shape,
    ),
    "journal-summary": Task(
        "journal-summary", "journal_summary.j2", cards.JournalIn, cards.JournalOut, cards.journal_context, _dump,
        images="optional",
    ),
    "food-nutrition": Task(
        "food-nutrition", "food_nutrition.j2", cards.DescriptionIn, cards.FoodNutritionOut,
        cards.description_context, _dump,
    ),
    "workout-estimate": Task(
        "workout-estimate", "workout_estimate.j2", cards.DescriptionIn, cards.WorkoutEstimateOut,
        cards.description_context, _dump,
    ),
}


def get_task(name: str) -> Task:
    if name not in TASKS:
        raise TaskNotFound(name)
    return TASKS[name]


def render_prompt(task: Task, context: dict[str, Any]) -> str:
    return PROMPTS.get_template(task.template).render(**context)


def extract_json(text: str) -> Any:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object in reply")
        text = text[start:end + 1]
    return json.loads(text)


def generate(task: Task, prompt: str, images: list[tuple[str, bytes]] | None = None) -> BaseModel:
    """Call Claude and validate the reply; one automatic retry on an invalid reply."""
    system = SYSTEM_PROMPT.format(schema=json.dumps(task.output_model.model_json_schema()))
    client = get_ai_client()
    for _ in range(2):
        reply = client.complete(system, prompt, images or [])  # AIUnavailable propagates
        try:
            return task.output_model.model_validate(extract_json(reply))
        except (ValueError, ValidationError):
            continue
    raise AIInvalidReply(task.name)
