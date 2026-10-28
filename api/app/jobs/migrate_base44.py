"""One-time Base44 -> DiabetEasy copy (Phase 1c).

    python -m app.jobs.migrate_base44 plan --source DIR_OR_S3 --report-dir DIR

`plan` is read-only: it reads one JSON or CSV file per Base44 entity, resolves
owners by created_by email, maps UserProfile.consent_* to PrivacyConsent and
writes migration_report.json and unmatched_emails.csv. stdout gets counts only
(never emails or health values).

    python -m app.jobs.migrate_base44 apply --source DIR_OR_S3 [--dry-run] --report-dir DIR
    python -m app.jobs.migrate_base44 purge --source DIR_OR_S3 --confirm

`apply` copies the export (re-runnable, rows matched by base44_id) and writes
apply_report.json; `purge` deletes the export files once the copy is verified.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

USER_ENTITY = "User"
# Base44 entity name -> target table (the 10 tables; PrivacyConsent is derived from UserProfile).
TABLES = {
    "UserProfile": "user_profile",
    "GlucoseReading": "glucose_reading",
    "MealPlan": "meal_plan",
    "ExercisePlan": "exercise_plan",
    "ExerciseLog": "exercise_log",
    "SleepLog": "sleep_log",
    "ActivityData": "activity_data",
    "StressLog": "stress_log",
    "PrivacyConsent": "privacy_consent",
    "Medication": "medication",
}
NOT_COPIED = {"MedicationLog"}
CONSENT_FIELDS = ("consent_location", "consent_cgm", "consent_wearables", "consent_email", "consent_given_at")


def normalize_email(value) -> str:
    return (value or "").strip().lower()


def email_category(email: str) -> str:
    domain = email.rsplit("@", 1)[-1]
    if domain == "privaterelay.appleid.com":
        return "apple_relay"
    if domain in {"gmail.com", "googlemail.com"}:
        return "google_mail"
    return "other"


def map_consent(profile: dict) -> tuple[dict | None, list[str]]:
    """Return (PrivacyConsent row or None, names of defaulted fields)."""
    if all(profile.get(f) in (None, "") for f in CONSENT_FIELDS):
        return None, []
    defaulted: list[str] = []

    def pick(field: str, default: bool) -> bool:
        value = profile.get(field)
        if value in (None, ""):
            defaulted.append(field.removeprefix("consent_"))
            return default
        return value if isinstance(value, bool) else str(value).lower() in {"true", "1", "yes"}

    row = {
        "location": pick("consent_location", False),
        "cgm": pick("consent_cgm", False),
        "wearables": pick("consent_wearables", False),
        "email": pick("consent_email", True),
        "consented_at": profile.get("consent_given_at") or None,
        "base44_id": f"{profile.get('id')}:consent",
    }
    return row, defaulted


def _parse(name: str, text: str) -> list[dict]:
    if name.endswith(".json"):
        data = json.loads(text)
        return data.get("records", data.get("items", [])) if isinstance(data, dict) else data
    return list(csv.DictReader(io.StringIO(text)))


def read_source(source: str) -> dict[str, list[dict]]:
    """Read {Entity}.json / {Entity}.csv files from a local directory or s3://bucket/prefix/."""
    files: dict[str, str] = {}
    if source.startswith("s3://"):
        import boto3

        bucket, _, prefix = source[5:].partition("/")
        s3 = boto3.client("s3")
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                files[key.rsplit("/", 1)[-1]] = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
    else:
        for path in Path(source).iterdir():
            if path.suffix in {".json", ".csv"}:
                files[path.name] = path.read_text(encoding="utf-8")
    return {name.rsplit(".", 1)[0]: _parse(name, text) for name, text in files.items()}


def plan(entities: dict[str, list[dict]]) -> tuple[dict, list[dict]]:
    if USER_ENTITY not in entities:
        raise SystemExit("file-level error: the export has no User file; nothing was read further")
    report: dict = {"tables": {}, "users": Counter(), "consent": Counter(), "match_forecast": Counter(),
                    "libre_credentials": Counter(), "not_copied": {}}
    unmatched: list[dict] = []

    owners: dict[str, str] = {}  # normalized email -> base44 user id
    users = sorted(entities[USER_ENTITY], key=lambda u: str(u.get("created_date") or ""))
    for user in users:
        email = normalize_email(user.get("email"))
        if not email:
            report["users"]["missing_email"] += 1
            unmatched.append({"email": "", "base44_user_id": user.get("id"), "category": "missing_email"})
            continue
        if email in owners:
            report["users"]["duplicate_case"] += 1
            unmatched.append({"email": user.get("email"), "base44_user_id": user.get("id"), "category": "duplicate_case"})
            continue
        owners[email] = str(user.get("id"))
        report["users"]["created"] += 1
        category = email_category(email)
        report["match_forecast"][category] += 1
        if category == "apple_relay":
            unmatched.append({"email": email, "base44_user_id": user.get("id"), "category": "apple_relay"})

    owned = Counter()
    orphans = Counter()
    for entity, rows in entities.items():
        if entity == USER_ENTITY:
            continue
        if entity not in TABLES:
            report["not_copied"][entity] = len(rows)
            continue
        stats = {"source": len(rows), "would_copy": 0, "skipped": Counter()}
        for row in rows:
            owner = normalize_email(row.get("created_by"))
            if owner not in owners:
                stats["skipped"]["orphan_created_by"] += 1
                orphans[owner] += 1
                continue
            owned[owner] += 1
            stats["would_copy"] += 1
            if entity == "UserProfile":
                consent, defaulted = map_consent(row)
                if consent is None:
                    report["consent"]["no_consent_recorded"] += 1
                else:
                    report["consent"]["mapped"] += 1
                    for name in defaulted:
                        report["consent"][f"defaulted_{name}"] += 1
                if row.get("libre_password"):
                    report["libre_credentials"]["present"] += 1
                    report["libre_credentials"]["excluded"] += 1
        stats["reconciles"] = stats["source"] == stats["would_copy"] + sum(stats["skipped"].values())
        report["tables"][TABLES[entity]] = stats

    for row in unmatched:
        row["owned_row_count"] = owned.get(normalize_email(row["email"]), 0) if row["category"] == "apple_relay" else 0
    for email, count in orphans.items():
        unmatched.append({"email": email, "base44_user_id": "", "category": "orphan_created_by", "owned_row_count": count})
    return report, unmatched


# Base44 bookkeeping keys that never become columns or extra.
META_KEYS = {"id", "created_by", "created_by_id", "created_date", "updated_date", "is_sample"}
# Base44 field name -> column name, per entity.
ALIASES = {"ActivityData": {"calories_burned": "calories", "heart_rate_resting": "resting_heart_rate"}}
# Fields that are never copied (session tokens) or are handled separately.
DROPPED = {"UserProfile": {"libre_auth_token", "libre_password", *CONSENT_FIELDS}}


def _coerce(column, value):
    """Convert a Base44 value to the column's Python type; raises ValueError if it does not fit."""
    from datetime import date, datetime

    from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text

    if value in (None, ""):
        return None
    ctype = column.type
    if isinstance(ctype, Boolean):
        return value if isinstance(value, bool) else str(value).lower() in {"true", "1", "yes"}
    if isinstance(ctype, Integer):
        return int(float(value))
    if isinstance(ctype, Float):
        return float(value)
    if isinstance(ctype, DateTime):
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if isinstance(ctype, Date):
        return date.fromisoformat(str(value)[:10])
    if isinstance(ctype, (String, Text)):
        return str(value)
    return value  # JSON


def _map_row(entity: str, model, row: dict) -> dict:
    """Map one Base44 row to column values plus `extra` for fields without a column."""
    columns = {c.name: c for c in model.__table__.columns}
    internal = {"id", "user_id", "base44_id", "created_at", "updated_at", "extra"}
    aliases = ALIASES.get(entity, {})
    values: dict = {}
    extra: dict = {}
    for key, value in row.items():
        if key in META_KEYS or key in DROPPED.get(entity, set()):
            continue
        if entity == "GlucoseReading" and key == "source":
            continue
        name = aliases.get(key, key)
        if name in columns and name not in internal and not name.endswith("_enc"):
            try:
                values[name] = _coerce(columns[name], value)
                continue
            except (TypeError, ValueError):
                pass
        if value not in (None, ""):
            extra[key] = value
    if entity == "GlucoseReading":
        source = str(row.get("source") or "manual").lower()
        values["source_device"] = "libre" if source.startswith("libre") else source
        if values["source_device"] == "libre" and row.get("date") and row.get("reading_time"):
            values["external_id"] = f"{row['date']}T{row['reading_time']}"
    if entity == "UserProfile" and row.get("libre_password"):
        from app.security.crypto import encrypt

        values["libre_password_enc"] = encrypt(str(row["libre_password"]))
    created = row.get("created_date")
    if created:
        try:
            values["created_at"] = _coerce(columns["created_at"], created)
        except ValueError:
            pass
    values["extra"] = extra or None
    return values


def _apply(db, entities: dict[str, list[dict]]) -> dict[str, dict]:
    """Upsert every row by base44_id. Returns per-entity counts."""
    from sqlalchemy import select

    from app.models import ENTITIES, User

    def counts(source: int = 0) -> dict:
        return {"source": source, "inserted": 0, "updated": 0, "skipped_unmatched": 0, "duplicates": 0}

    tables: dict[str, dict] = {USER_ENTITY: counts(len(entities[USER_ENTITY]))}
    owners: dict[str, str] = {}  # normalized email -> users.id
    for row in sorted(entities[USER_ENTITY], key=lambda u: str(u.get("created_date") or "")):
        stats = tables[USER_ENTITY]
        email = normalize_email(row.get("email"))
        if not email:
            stats["skipped_unmatched"] += 1
            continue
        if email in owners:
            stats["duplicates"] += 1
            continue
        user = db.scalar(select(User).where(User.base44_id == str(row.get("id")))) or \
            db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email)
            db.add(user)
            stats["inserted"] += 1
        else:
            stats["updated"] += 1
        user.email = email
        user.full_name = row.get("full_name") or user.full_name
        user.base44_id = str(row.get("id"))
        if row.get("created_date"):
            try:
                user.created_at = _coerce(User.__table__.c.created_at, row["created_date"])
            except ValueError:
                pass
        db.flush()
        owners[email] = user.id

    def upsert(entity: str, user_id: str, values: dict, base44_id: str) -> None:
        model = ENTITIES[entity]
        stats = tables.setdefault(entity, counts())
        existing = db.scalar(select(model).where(model.base44_id == base44_id))
        if existing is None and entity == "UserProfile":
            existing = db.scalar(select(model).where(model.user_id == user_id))
        if existing is None and entity == "GlucoseReading" and values.get("external_id"):
            clash = db.scalar(select(model).where(model.user_id == user_id,
                                                  model.source_device == values["source_device"],
                                                  model.external_id == values["external_id"]))
            if clash is not None:
                stats["duplicates"] += 1
                return
        if existing is None:
            db.add(model(user_id=user_id, base44_id=base44_id, **values))
            stats["inserted"] += 1
        else:
            for key, value in values.items():
                setattr(existing, key, value)
            existing.base44_id = base44_id
            stats["updated"] += 1
        db.flush()

    for entity, rows in entities.items():
        if entity not in TABLES:
            continue
        model = ENTITIES[entity]
        tables.setdefault(entity, counts())["source"] += len(rows)
        for row in rows:
            owner = owners.get(normalize_email(row.get("created_by")))
            if owner is None:
                tables[entity]["skipped_unmatched"] += 1
                continue
            upsert(entity, owner, _map_row(entity, model, row), str(row.get("id")))
            if entity == "UserProfile":
                consent, _ = map_consent(row)
                if consent is not None:
                    tables.setdefault("PrivacyConsent", counts())["source"] += 1
                    consent_id = consent.pop("base44_id")
                    upsert("PrivacyConsent", owner, _map_row("PrivacyConsent", ENTITIES["PrivacyConsent"], consent),
                           consent_id)
    return tables


def run(source, dry_run: bool = False) -> dict:
    """Programmatic entry point: copy the export, re-runnable (rows are matched by base44_id).
    With dry_run=True the same copy runs inside a transaction that is rolled back."""
    from app.db import new_session

    entities = read_source(str(source))
    report, unmatched = plan(entities)
    with new_session() as db:
        try:
            tables = _apply(db, entities)
        except Exception:
            db.rollback()
            raise
        if dry_run:
            db.rollback()
        else:
            db.commit()
    return {
        "dry_run": dry_run,
        "counts_match": all(s["source"] == s["inserted"] + s["updated"] + s["skipped_unmatched"] + s["duplicates"]
                            for s in tables.values()),
        "tables": tables,
        "unmatched_emails": sorted(r["email"] for r in unmatched if r["category"] == "orphan_created_by"),
        "not_copied": report["not_copied"],
    }


def write_reports(report: dict, unmatched: list[dict], report_dir: str) -> None:
    out = Path(report_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "migration_report.json").write_text(json.dumps(report, indent=2, default=dict))
    with (out / "unmatched_emails.csv").open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["email", "base44_user_id", "category", "owned_row_count"])
        writer.writeheader()
        writer.writerows(unmatched)


def _main_apply(args) -> int:
    """Copy the export into the database (re-runnable); writes apply_report.json, prints counts only."""
    from app.config import get_settings

    if get_settings().is_production and not args.allow_production and not args.dry_run:
        print("apply refuses to write to production without --allow-production", file=sys.stderr)
        return 2
    started = time.time()
    result = run(args.source, dry_run=args.dry_run)
    result.update(run_id=str(uuid.uuid4()), mode="apply", seconds=round(time.time() - started, 2))
    out = Path(args.report_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "apply_report.json").write_text(json.dumps(result, indent=2, default=dict))
    for entity, stats in result["tables"].items():
        print(f"{entity}: " + " ".join(f"{k}={v}" for k, v in stats.items()))
    print(f"dry_run={result['dry_run']} counts_match={result['counts_match']} "
          f"unmatched={len(result['unmatched_emails'])}")
    return 0 if result["counts_match"] else 1


def purge_source(source: str) -> int:
    """Delete the Base44 export files (*.json / *.csv) at a local directory or s3://bucket/prefix/.
    The export holds plaintext Libre passwords and health data, so it is removed after a verified apply.
    Returns the number of files deleted."""
    deleted = 0
    if source.startswith("s3://"):
        import boto3

        bucket, _, prefix = source[5:].partition("/")
        s3 = boto3.client("s3")
        for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Versions", []) + page.get("DeleteMarkers", []):
                s3.delete_object(Bucket=bucket, Key=obj["Key"], VersionId=obj["VersionId"])
                deleted += 1
    else:
        for path in Path(source).iterdir():
            if path.suffix in {".json", ".csv"}:
                path.unlink()
                deleted += 1
    return deleted


def _main_purge(args) -> int:
    if not args.confirm:
        print("purge deletes the Base44 export at --source; re-run with --confirm after a verified apply",
              file=sys.stderr)
        return 2
    print(f"purged files={purge_source(args.source)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.migrate_base44")
    parser.add_argument("mode", choices=["plan", "apply", "purge"])
    parser.add_argument("--source")
    parser.add_argument("--report-dir", default="reports")
    parser.add_argument("--dry-run", action="store_true", help="apply: run the copy and roll it back")
    parser.add_argument("--confirm", action="store_true", help="purge: required to actually delete the export")
    parser.add_argument("--allow-production", action="store_true",
                        help="apply: required when APP_ENV=production (the Phase 2b cutover copy)")
    args = parser.parse_args(argv)
    if not args.source:
        parser.error(f"--source is required for {args.mode}")
    if args.mode == "apply":
        return _main_apply(args)
    if args.mode == "purge":
        return _main_purge(args)
    started = time.time()
    report, unmatched = plan(read_source(args.source))
    report.update(run_id=str(uuid.uuid4()), mode="plan", source=args.source, seconds=round(time.time() - started, 2))
    write_reports(report, unmatched, args.report_dir)
    for table, stats in report["tables"].items():
        print(f"{table}: source={stats['source']} would_copy={stats['would_copy']} skipped={sum(stats['skipped'].values())}")
    print(f"users={dict(report['users'])} unmatched={len(unmatched)}")
    return 0 if all(s["reconciles"] for s in report["tables"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
