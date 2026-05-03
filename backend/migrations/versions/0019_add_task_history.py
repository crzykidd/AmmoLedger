"""add task_history and task_registry tables

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-02

"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "task_history",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("task_name", sa.Text(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("status", sa.Text(), nullable=False, server_default="running"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("triggered_by", sa.Text(), nullable=False, server_default="scheduler"),
        )
    except Exception:
        pass  # Table already exists

    try:
        op.create_table(
            "task_registry",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("task_key", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("interval_type", sa.Text(), nullable=False),
            sa.Column("interval_value", sa.Text(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("last_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_status", sa.Text(), nullable=True),
            sa.Column("last_duration_ms", sa.Integer(), nullable=True),
            sa.Column("next_run_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    except Exception:
        pass  # Table already exists

    try:
        op.create_index(
            "ix_task_registry_task_key",
            "task_registry",
            ["task_key"],
            unique=True,
        )
    except Exception:
        pass  # Index already exists


def downgrade() -> None:
    op.drop_index("ix_task_registry_task_key", table_name="task_registry")
    op.drop_table("task_registry")
    op.drop_table("task_history")
