"""POST /api/v1/ai/{task}: server-defined Claude tasks with schema-validated JSON replies."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.ai import tasks
from app.ai.client import AIUnavailable
from app.ai.context import InsufficientData
from app.auth.deps import current_user
from app.db import get_db
from app.models import User
from app.ratelimit import consume_ai_quota
from app.routers.uploads import sniff_image
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

CLAUDE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILES = 4


def _load_images(user: User, file_keys: Any) -> list[tuple[str, bytes]]:
    if not isinstance(file_keys, list) or len(file_keys) > MAX_FILES or not all(isinstance(k, str) for k in file_keys):
        raise HTTPException(status_code=422, detail=f"file_keys must be a list of at most {MAX_FILES} keys")
    storage = get_storage()
    images = []
    for key in file_keys:
        if not key.startswith(f"users/{user.id}/") or ".." in key or not storage.exists(key):
            raise HTTPException(status_code=404, detail="File not found")
        data = storage.get(key)
        media_type = sniff_image(data)
        if media_type not in CLAUDE_IMAGE_TYPES:
            raise HTTPException(status_code=422, detail="Only JPEG, PNG and WebP photos can be analysed")
        images.append((media_type, data))
    return images


@router.post(
    "/{task_name}",
    summary="Run an AI task (meal-plan, exercise-plan, weekly-insights, food-photo, glucose-trends, "
    "recommendations, routine-analysis, nutrition-comparison, daily-trend, journal-summary, food-nutrition, "
    "workout-estimate)",
)
def run_task(
    task_name: str,
    body: dict[str, Any] = Body(default_factory=dict, examples=[{"days": 3, "targetCalories": 1800}]),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    try:
        task = tasks.get_task(task_name)
    except tasks.TaskNotFound:
        raise HTTPException(status_code=404, detail=f"Unknown AI task '{task_name}'") from None

    body = dict(body)
    file_keys = body.pop("file_keys", [])
    try:
        inputs = task.input_model.model_validate(body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False)) from None
    if task.images == "none" and file_keys:
        raise HTTPException(status_code=422, detail=f"Task '{task_name}' does not accept files")
    if task.images == "required" and not file_keys:
        raise HTTPException(status_code=422, detail=f"Task '{task_name}' needs at least one file_key")
    images = _load_images(user, file_keys) if file_keys else []

    try:
        context = task.build_context(db, user, inputs)
    except tasks.ProfileMissing:
        raise HTTPException(status_code=404, detail="User profile not found") from None
    except InsufficientData:
        return JSONResponse(status_code=422, content={"detail": "insufficient_data", "error": "insufficient_data"})
    context["has_image"] = bool(images)
    consume_ai_quota(db, user)
    try:
        output = tasks.generate(task, tasks.render_prompt(task, context), images)
    except AIUnavailable:
        return JSONResponse(
            status_code=503,
            content={"detail": "Insights are temporarily unavailable, try again shortly", "retryable": True},
        )
    except tasks.AIInvalidReply:
        return JSONResponse(status_code=502, content={"detail": "Could not generate a plan", "retryable": False})
    return task.shape(output, context)
