"""add community sync fields to lookup tables

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-02

"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _add_column(table: str, column: sa.Column) -> None:
    try:
        op.add_column(table, column)
    except Exception:
        pass  # Column already exists


def upgrade() -> None:
    # community_key and is_imported on all four community-synced tables
    for table in ("calibers", "manufacturers", "ammo_types", "dealers"):
        _add_column(table, sa.Column("community_key", sa.Text(), nullable=True))
        _add_column(table, sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"))

    # Dealer-specific geo/type fields
    _add_column("dealers", sa.Column("types", sa.Text(), nullable=True))
    _add_column("dealers", sa.Column("country", sa.Text(), nullable=True, server_default="US"))
    _add_column("dealers", sa.Column("state", sa.Text(), nullable=True))
    _add_column("dealers", sa.Column("is_standard_geo", sa.Boolean(), nullable=False, server_default="1"))


def downgrade() -> None:
    for table in ("calibers", "manufacturers", "ammo_types", "dealers"):
        try:
            op.drop_column(table, "community_key")
        except Exception:
            pass
        try:
            op.drop_column(table, "is_imported")
        except Exception:
            pass

    for col in ("types", "country", "state", "is_standard_geo"):
        try:
            op.drop_column("dealers", col)
        except Exception:
            pass
