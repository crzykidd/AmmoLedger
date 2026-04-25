"""add first_name and last_name to users

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-25

"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.Text(), server_default="", nullable=False))
        batch_op.add_column(sa.Column("last_name", sa.Text(), server_default="", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("last_name")
        batch_op.drop_column("first_name")
