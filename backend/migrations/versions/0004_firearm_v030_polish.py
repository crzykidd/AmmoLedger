"""firearm v0.3.0 polish — nickname, condition, sight_radius, weight, twist_rate

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-17

Adds a new `firearm_conditions` lookup table (shape mirrors
`firearm_action_types`) and six new columns to `firearms`:

  nickname            free-text identity field
  firearm_condition_id FK → firearm_conditions
  sight_radius_in     float, inches
  weight              float, bare value
  weight_unit         OZ | LB (CHECK constraint)
  twist_rate          free string, e.g. "1:7"

The CHECK constraint on weight_unit uses batch_alter_table (required for
SQLite column-level constraints added post-CREATE). FK index on
firearm_condition_id is created in the same migration per the project's
FK-index-in-same-migration rule.
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New lookup table — same shape as firearm_action_types.
    op.create_table(
        "firearm_conditions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'user'")),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # Six new columns on firearms. batch_alter_table is required for SQLite
    # when adding CHECK constraints or FK references alongside new columns.
    with op.batch_alter_table("firearms") as batch_op:
        batch_op.add_column(sa.Column("nickname", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("firearm_condition_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("sight_radius_in", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("weight", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("weight_unit", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("twist_rate", sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            "fk_firearms_firearm_condition_id",
            "firearm_conditions",
            ["firearm_condition_id"],
            ["id"],
        )
        batch_op.create_check_constraint(
            "ck_firearms_weight_unit",
            "weight_unit IN ('OZ', 'LB') OR weight_unit IS NULL",
        )

    # FK index — same migration per project rule.
    op.create_index(
        "ix_firearms_firearm_condition_id",
        "firearms",
        ["firearm_condition_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_firearms_firearm_condition_id", table_name="firearms")

    with op.batch_alter_table("firearms") as batch_op:
        batch_op.drop_constraint("ck_firearms_weight_unit", type_="check")
        batch_op.drop_constraint("fk_firearms_firearm_condition_id", type_="foreignkey")
        batch_op.drop_column("twist_rate")
        batch_op.drop_column("weight_unit")
        batch_op.drop_column("weight")
        batch_op.drop_column("sight_radius_in")
        batch_op.drop_column("firearm_condition_id")
        batch_op.drop_column("nickname")

    op.drop_table("firearm_conditions")
