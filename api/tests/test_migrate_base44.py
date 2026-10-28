import json
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select

from app.db import new_session
from app.jobs import migrate_base44
from app.models import ActivityData, GlucoseReading, User, UserProfile
from app.security.crypto import decrypt

API_DIR = Path(__file__).resolve().parent.parent


def write_export(folder: Path) -> None:
    files = {
        "User": [
            {"id": "u1", "email": "Alice@Example.com", "full_name": "Alice", "created_date": "2024-05-01T10:00:00Z"},
            {"id": "u2", "email": "bob@example.com", "full_name": "Bob"},
        ],
        "UserProfile": [{
            "id": "p1", "created_by": "alice@example.com", "diabetes_type": "type1", "age": "34",
            "libre_email": "alice@libre.com", "libre_password": "hunter2", "libre_auth_token": "tok",
            "cgm_device": "libre2", "last_steps": 4000,
        }],
        "GlucoseReading": [
            {"id": "g1", "created_by": "alice@example.com", "reading": 120, "date": "2025-01-15",
             "reading_time": "10:30", "source": "libre2", "trend": "stable"},
            {"id": "g2", "created_by": "alice@example.com", "reading": 140, "date": "2025-01-15", "context": "fasting"},
            {"id": "g3", "created_by": "ghost@example.com", "reading": 99},
        ],
        "ActivityData": [{"id": "a1", "created_by": "bob@example.com", "date": "2025-01-14",
                          "steps": 5000, "calories_burned": 1900, "heart_rate_resting": 60, "source": "fitbit"}],
    }
    for name, rows in files.items():
        (folder / f"{name}.json").write_text(json.dumps(rows))


def test_dry_run_then_real_run_then_rerun_without_duplicates(tmp_path):
    write_export(tmp_path)

    dry = migrate_base44.run(tmp_path, dry_run=True)
    assert dry["counts_match"] is True
    assert dry["tables"]["GlucoseReading"] == {"source": 3, "inserted": 2, "updated": 0,
                                               "skipped_unmatched": 1, "duplicates": 0}
    assert dry["unmatched_emails"] == ["ghost@example.com"]
    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0  # rolled back

    real = migrate_base44.run(tmp_path)
    assert real["tables"]["User"]["inserted"] == 2 and real["counts_match"] is True
    again = migrate_base44.run(tmp_path)
    assert again["tables"]["GlucoseReading"]["updated"] == 2 and again["tables"]["GlucoseReading"]["inserted"] == 0

    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 2
        assert db.scalar(select(func.count()).select_from(GlucoseReading)) == 2
        alice = db.scalar(select(User).where(User.email == "alice@example.com"))
        assert alice.base44_id == "u1" and alice.apple_sub is None
        profile = db.scalar(select(UserProfile))
        assert profile.age == 34 and decrypt(profile.libre_password_enc) == "hunter2"
        assert profile.extra == {"cgm_device": "libre2", "last_steps": 4000}  # no session token copied
        libre = db.scalar(select(GlucoseReading).where(GlucoseReading.base44_id == "g1"))
        assert (libre.source_device, libre.external_id) == ("libre", "2025-01-15T10:30")
        activity = db.scalar(select(ActivityData))
        assert (activity.calories, activity.resting_heart_rate) == (1900, 60)


def test_cli_apply_then_purge(tmp_path, capsys):
    export, reports = tmp_path / "export", tmp_path / "reports"
    export.mkdir()
    write_export(export)
    assert migrate_base44.main(["apply", "--source", str(export), "--report-dir", str(reports)]) == 0
    assert json.loads((reports / "apply_report.json").read_text())["tables"]["User"]["inserted"] == 2
    assert "alice@example.com" not in capsys.readouterr().out.lower()  # counts only on stdout
    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 2

    assert migrate_base44.main(["purge", "--source", str(export)]) == 2  # refuses without --confirm
    assert len(list(export.iterdir())) == 4
    assert migrate_base44.main(["purge", "--source", str(export), "--confirm"]) == 0
    assert list(export.iterdir()) == []


def test_apply_refuses_production_without_allow_production(tmp_path, monkeypatch):
    import types

    import app.config

    write_export(tmp_path)
    monkeypatch.setattr(app.config, "get_settings", lambda: types.SimpleNamespace(is_production=True))
    args = ["apply", "--source", str(tmp_path), "--report-dir", str(tmp_path / "r")]
    assert migrate_base44.main(args) == 2
    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
    assert migrate_base44.main([*args, "--allow-production"]) == 0


def test_alembic_migration_builds_the_schema(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrated.db'}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {"users", "user_profiles", "glucose_readings", "meal_plans", "exercise_plans", "exercise_logs",
            "sleep_logs", "activity_data", "stress_logs", "privacy_consents", "medications"} <= tables
