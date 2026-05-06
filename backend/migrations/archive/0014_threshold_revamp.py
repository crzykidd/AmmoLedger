"""three-tier threshold system: caliber_thresholds, location_thresholds

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "caliber_thresholds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("caliber_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("caliber_id"),
    )
    op.create_table(
        "location_thresholds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("location_id"),
    )
    op.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('threshold_default_rounds', '200')"
    )


def downgrade() -> None:
    op.drop_table("location_thresholds")
    op.drop_table("caliber_thresholds")
    op.execute("DELETE FROM app_settings WHERE key = 'threshold_default_rounds'")
