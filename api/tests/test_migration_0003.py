"""Phase 4a: alembic 0003_dexcom upgrades and downgrades cleanly (SQLite here; PostgreSQL in CI)."""

from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

API_DIR = Path(__file__).resolve().parent.parent
DEXCOM = {"dexcom_access_token_enc", "dexcom_refresh_token_enc", "dexcom_token_expires_at", "dexcom_last_sync_at"}


def _columns(url: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return {c["name"] for c in sa.inspect(engine).get_columns("user_profiles")}
    finally:
        engine.dispose()


def test_0003_upgrade_and_downgrade(tmp_path):
    url = f"sqlite:///{tmp_path}/migrate.db"
    cfg = Config()
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    assert DEXCOM <= _columns(url)
    command.downgrade(cfg, "0001")
    assert not DEXCOM & _columns(url)
    command.upgrade(cfg, "head")
    assert DEXCOM <= _columns(url)
