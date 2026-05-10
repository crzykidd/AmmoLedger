"""add range sessions + range session lines (P3)

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-09

Adds the range_sessions and range_session_lines tables, plus an FK column
on the existing expenditure_log table that links any session-driven
expenditure back to the line that created it. That bidirectional link is
what session/line reversal queries on — deleting a line restores the
ammo box and removes the corresponding expenditure_log row.

Tables:
- range_sessions       (header: owner, date, location, notes, is_shared)
- range_session_lines  (one per firearm/box pairing within a session)

Schema rules per project DB policy:
- Every FK column gets its index in the same migration.
- range_session_lines carries CHECK constraints so a line cannot be
  totally empty (must reference at least one of firearm/box) and
  rounds_fired cannot be negative.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # range_sessions — session header.
    # -------------------------------------------------------------------------

    op.create_table(
        "range_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("location_name", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_range_sessions_owner_id",  "range_sessions", ["owner_id"])
    op.create_index("ix_range_sessions_is_shared", "range_sessions", ["is_shared"])
    op.create_index("ix_range_sessions_date",      "range_sessions", ["date"])

    # -------------------------------------------------------------------------
    # range_session_lines — one row per firearm/ammo-box pairing.
    # At least one of firearm_id or ammo_box_id must be set; both is the
    # typical case (fired this gun, drew from this box).
    # -------------------------------------------------------------------------

    op.create_table(
        "range_session_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("firearm_id", sa.Integer(), nullable=True),
        sa.Column("ammo_box_id", sa.Integer(), nullable=True),
        sa.Column("rounds_fired", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["range_sessions.id"]),
        sa.ForeignKeyConstraint(["firearm_id"], ["firearms.id"]),
        sa.ForeignKeyConstraint(["ammo_box_id"], ["ammo_box.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "firearm_id IS NOT NULL OR ammo_box_id IS NOT NULL",
            name="ck_range_session_lines_firearm_or_box",
        ),
        sa.CheckConstraint(
            "rounds_fired >= 0",
            name="ck_range_session_lines_rounds_nonneg",
        ),
    )
    op.create_index("ix_range_session_lines_session_id",  "range_session_lines", ["session_id"])
    op.create_index("ix_range_session_lines_firearm_id",  "range_session_lines", ["firearm_id"])
    op.create_index("ix_range_session_lines_ammo_box_id", "range_session_lines", ["ammo_box_id"])

    # -------------------------------------------------------------------------
    # expenditure_log.range_session_line_id — bidirectional audit link.
    # A session-driven expenditure carries the line ID that produced it;
    # ad-hoc /ammo/:id/expend rows leave this NULL.
    # -------------------------------------------------------------------------

    with op.batch_alter_table("expenditure_log") as batch:
        batch.add_column(sa.Column("range_session_line_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_expenditure_log_range_session_line_id",
            "range_session_lines",
            ["range_session_line_id"],
            ["id"],
        )

    op.create_index(
        "ix_expenditure_log_range_session_line_id",
        "expenditure_log",
        ["range_session_line_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_expenditure_log_range_session_line_id",
        table_name="expenditure_log",
    )
    with op.batch_alter_table("expenditure_log") as batch:
        batch.drop_constraint(
            "fk_expenditure_log_range_session_line_id",
            type_="foreignkey",
        )
        batch.drop_column("range_session_line_id")

    op.drop_index("ix_range_session_lines_ammo_box_id", table_name="range_session_lines")
    op.drop_index("ix_range_session_lines_firearm_id",  table_name="range_session_lines")
    op.drop_index("ix_range_session_lines_session_id",  table_name="range_session_lines")
    op.drop_table("range_session_lines")

    op.drop_index("ix_range_sessions_date",      table_name="range_sessions")
    op.drop_index("ix_range_sessions_is_shared", table_name="range_sessions")
    op.drop_index("ix_range_sessions_owner_id",  table_name="range_sessions")
    op.drop_table("range_sessions")
