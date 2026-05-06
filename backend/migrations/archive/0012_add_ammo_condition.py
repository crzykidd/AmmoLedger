"""add ammo_conditions table and ammo_condition_id to ammo_box

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ammo_conditions",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="yaml"),
    )
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.add_column(
            sa.Column("ammo_condition_id", sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.drop_column("ammo_condition_id")
    op.drop_table("ammo_conditions")
