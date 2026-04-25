"""add legacy_id, split_from_id, is_archived, archive_reason to ammo_box

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-25

"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.add_column(sa.Column("legacy_id", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("split_from_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("archive_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.drop_column("archive_reason")
        batch_op.drop_column("is_archived")
        batch_op.drop_column("split_from_id")
        batch_op.drop_column("legacy_id")
