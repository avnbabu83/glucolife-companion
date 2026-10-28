"""Phase 4a: Dexcom token columns on user_profiles (additive, reversible, no backfill).

Revision ID: 0003
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0001"
branch_labels = None
depends_on = None

COLUMNS = ("dexcom_access_token_enc", "dexcom_refresh_token_enc", "dexcom_token_expires_at", "dexcom_last_sync_at")


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("dexcom_access_token_enc", sa.Text(), nullable=True))
        batch.add_column(sa.Column("dexcom_refresh_token_enc", sa.Text(), nullable=True))
        batch.add_column(sa.Column("dexcom_token_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("dexcom_last_sync_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch:
        for name in reversed(COLUMNS):
            batch.drop_column(name)
