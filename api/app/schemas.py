"""Per-entity Pydantic schemas generated from the SQLAlchemy models.

The models are the single source of truth. Encrypted (`*_enc`) and hidden
columns never appear in any schema, so they can never be read or written
through the generic entity API. Create/Update schemas forbid unknown fields
(422); Base44 fields that have no typed column go into `extra`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, create_model
from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Float, Integer, String

from app.models import ENTITIES, HealthRecord, UserProfile, as_utc

INTERNAL = {"id", "user_id", "base44_id", "created_at", "updated_at", "extra"}


def python_type(column: Column) -> Any:
    t = column.type
    if isinstance(t, JSON):
        return Any
    if isinstance(t, Boolean):
        return bool
    if isinstance(t, DateTime):
        return datetime
    if isinstance(t, Date):
        return date
    if isinstance(t, Integer):
        return int
    if isinstance(t, Float):
        return float
    if isinstance(t, String):
        if t.length:
            return Annotated[str, StringConstraints(max_length=t.length)]
        return str
    raise TypeError(f"Unsupported column type {t!r}")


def visible_columns(model: type[HealthRecord]) -> list[Column]:
    return [
        c
        for c in model.__table__.columns
        if c.name not in INTERNAL and not c.name.endswith("_enc") and c.name not in model.__hidden__
    ]


@dataclass
class EntitySpec:
    name: str
    model: type[HealthRecord]
    create_schema: type[BaseModel]
    update_schema: type[BaseModel]
    read_schema: type[BaseModel]
    columns: dict[str, Column]  # writable columns
    filterable: dict[str, Any]  # name -> python type used to parse query values
    sortable: set[str]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def build_spec(name: str, model: type[HealthRecord]) -> EntitySpec:
    visible = visible_columns(model)
    writable = [c for c in visible if c.name not in model.__readonly__]

    create_fields: dict[str, Any] = {"extra": (Optional[dict[str, Any]], None)}
    update_fields: dict[str, Any] = {"extra": (Optional[dict[str, Any]], None)}
    for col in writable:
        py = python_type(col)
        if col.name in model.__required__:
            create_fields[col.name] = (py, ...)
        else:
            create_fields[col.name] = (Optional[py], None)
        update_fields[col.name] = (Optional[py], None)

    read_fields: dict[str, Any] = {
        "id": (str, ...),
        "created_at": (datetime, ...),
        "updated_at": (datetime, ...),
        "extra": (Optional[dict[str, Any]], None),
    }
    for col in visible:
        read_fields[col.name] = (Optional[python_type(col)], None)
    if model is UserProfile:
        read_fields["libre_connected"] = (bool, False)
        read_fields["fitbit_connected"] = (bool, False)
        read_fields["dexcom_connected"] = (bool, False)

    filterable = {
        c.name: (str if isinstance(c.type, String) else python_type(c))
        for c in visible
        if not isinstance(c.type, JSON) and not (isinstance(c.type, String) and c.type.length is None)
    }
    return EntitySpec(
        name=name,
        model=model,
        create_schema=create_model(f"{name}Create", __base__=_Strict, **create_fields),
        update_schema=create_model(f"{name}Update", __base__=_Strict, **update_fields),
        read_schema=create_model(f"{name}", __base__=_Read, **read_fields),
        columns={c.name: c for c in writable},
        filterable=filterable,
        sortable=set(filterable) | {"created_at", "updated_at"},
    )


SPECS: dict[str, EntitySpec] = {name: build_spec(name, model) for name, model in ENTITIES.items()}


def serialize(row: HealthRecord) -> dict[str, Any]:
    """Convert a row to its API representation (never includes encrypted fields)."""
    model = type(row)
    data: dict[str, Any] = {
        "id": row.id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "extra": row.extra,
    }
    for col in visible_columns(model):
        data[col.name] = getattr(row, col.name)
    for key, value in data.items():
        if isinstance(value, datetime):
            data[key] = as_utc(value)  # SQLite returns naive datetimes; always answer in UTC
    if isinstance(row, UserProfile):
        data["libre_connected"] = bool(row.libre_email and row.libre_password_enc)
        data["fitbit_connected"] = bool(row.fitbit_access_token_enc)
        data["dexcom_connected"] = bool(row.dexcom_refresh_token_enc or row.dexcom_access_token_enc)
    return data
