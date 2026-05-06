"""add is_active and source to locations and containers

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("locations", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"))
    op.add_column("locations", sa.Column("source", sa.Text(), nullable=False, server_default="user"))
    op.add_column("containers", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"))
    op.add_column("containers", sa.Column("source", sa.Text(), nullable=False, server_default="user"))


def downgrade() -> None:
    op.drop_column("locations", "source")
    op.drop_column("locations", "is_active")
    op.drop_column("containers", "source")
    op.drop_column("containers", "is_active")
