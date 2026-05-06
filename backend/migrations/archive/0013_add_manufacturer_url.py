"""add url column to manufacturers table

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("manufacturers") as batch_op:
        batch_op.add_column(sa.Column("url", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("manufacturers") as batch_op:
        batch_op.drop_column("url")
