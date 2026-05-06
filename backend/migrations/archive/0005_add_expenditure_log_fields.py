"""add log_type and related_ids to expenditure_log

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-25

"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("expenditure_log") as batch_op:
        batch_op.add_column(
            sa.Column("log_type", sa.Text(), nullable=False, server_default="expend")
        )
        batch_op.add_column(sa.Column("related_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("expenditure_log") as batch_op:
        batch_op.drop_column("related_ids")
        batch_op.drop_column("log_type")
