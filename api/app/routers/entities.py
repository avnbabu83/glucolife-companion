"""User-scoped CRUD over the 10 allow-listed health tables: /api/v1/entities/{entity}.

Routes are generated per entity so each one has its own Pydantic schemas in
the OpenAPI document. user_id always comes from the access token; filter and
sort fields are checked against per-entity allow-lists, and no SQL is ever
built from raw input.
"""

# No `from __future__ import annotations` here: FastAPI must see the real
# (dynamically created) schema classes in the route signatures.

from datetime import date, datetime, time, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import User, UserProfile
from app.schemas import SPECS, EntitySpec, serialize

router = APIRouter(prefix="/api/v1/entities", tags=["entities"])

RESERVED_PARAMS = {"sort", "limit", "since"}
SORT_ALIASES = {"created_date": "created_at", "updated_date": "updated_at"}


def _parse_filters(spec: EntitySpec, request: Request) -> list[Any]:
    clauses = []
    for key, raw in request.query_params.multi_items():
        if key in RESERVED_PARAMS:
            continue
        if key not in spec.filterable:
            raise HTTPException(status_code=422, detail=f"Filtering on '{key}' is not allowed for {spec.name}")
        try:
            value = TypeAdapter(spec.filterable[key]).validate_python(raw)
        except ValidationError:
            raise HTTPException(status_code=422, detail=f"Invalid value for '{key}'") from None
        clauses.append(getattr(spec.model, key) == value)
    return clauses


def _order_by(spec: EntitySpec, sort: Optional[str]) -> list[Any]:
    model = spec.model
    if not sort:
        return [model.created_at.desc(), model.id]
    desc = sort.startswith("-")
    field = SORT_ALIASES.get(sort.lstrip("-+"), sort.lstrip("-+"))
    if field not in spec.sortable:
        raise HTTPException(status_code=422, detail=f"Sorting on '{field}' is not allowed for {spec.name}")
    column = getattr(model, field)
    return [column.desc() if desc else column.asc(), model.id]


def _get_owned(db: Session, spec: EntitySpec, user: User, row_id: str):
    row = db.scalar(select(spec.model).where(spec.model.id == row_id, spec.model.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail=f"{spec.name} not found")
    return row


def _check_nullability(spec: EntitySpec, data: dict) -> None:
    for key, value in data.items():
        column = spec.columns.get(key)
        if value is None and column is not None and not column.nullable:
            raise HTTPException(status_code=422, detail=f"'{key}' cannot be null")


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A matching record already exists") from None


def _add_routes(spec: EntitySpec) -> None:
    Create, Update, Read = spec.create_schema, spec.update_schema, spec.read_schema
    model = spec.model
    name = spec.name

    def list_rows(
        request: Request,
        sort: Optional[str] = Query(None, description="Field to sort by; prefix with '-' for descending, e.g. -date"),
        limit: int = Query(50, ge=1, description="Default 50; values above 500 are capped at 500"),
        since: Optional[date] = Query(None, description="Only rows on or after this date"),
        user: User = Depends(current_user),
        db: Session = Depends(get_db),
    ):
        stmt = select(model).where(model.user_id == user.id, *_parse_filters(spec, request))
        if since is not None:
            if "date" in model.__table__.columns:
                stmt = stmt.where(model.date >= since)
            else:
                stmt = stmt.where(model.created_at >= datetime.combine(since, time.min, tzinfo=timezone.utc))
        rows = db.scalars(stmt.order_by(*_order_by(spec, sort)).limit(min(limit, 500)))
        return [serialize(r) for r in rows]

    def create_row(body: Create, user: User = Depends(current_user), db: Session = Depends(get_db)):
        data = body.model_dump(exclude_unset=True)
        _check_nullability(spec, data)
        if model is UserProfile and db.scalar(select(UserProfile.id).where(UserProfile.user_id == user.id)):
            raise HTTPException(status_code=409, detail="UserProfile already exists; use PATCH to update it")
        row = model(user_id=user.id, **data)
        db.add(row)
        _commit(db)
        return serialize(row)

    def get_row(row_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
        return serialize(_get_owned(db, spec, user, row_id))

    def update_row(row_id: str, body: Update, user: User = Depends(current_user), db: Session = Depends(get_db)):
        row = _get_owned(db, spec, user, row_id)
        data = body.model_dump(exclude_unset=True)
        _check_nullability(spec, data)
        for key, value in data.items():
            setattr(row, key, value)
        _commit(db)
        return serialize(row)

    def delete_row(row_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
        row = _get_owned(db, spec, user, row_id)
        db.delete(row)
        db.commit()
        return Response(status_code=204)

    router.add_api_route(f"/{name}", list_rows, methods=["GET"], response_model=list[Read],
                         name=f"list_{name}", summary=f"List my {name} rows")
    router.add_api_route(f"/{name}", create_row, methods=["POST"], response_model=Read, status_code=201,
                         name=f"create_{name}", summary=f"Create a {name} row")
    router.add_api_route(f"/{name}/{{row_id}}", get_row, methods=["GET"], response_model=Read,
                         name=f"get_{name}", summary=f"Get one of my {name} rows")
    router.add_api_route(f"/{name}/{{row_id}}", update_row, methods=["PATCH"], response_model=Read,
                         name=f"update_{name}", summary=f"Update one of my {name} rows")
    router.add_api_route(f"/{name}/{{row_id}}", delete_row, methods=["DELETE"], status_code=204,
                         response_class=Response, name=f"delete_{name}", summary=f"Delete one of my {name} rows")


for _spec in SPECS.values():
    _add_routes(_spec)
