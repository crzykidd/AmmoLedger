"""add location_id to ammo_box

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ammo_box",
        sa.Column("location_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ammo_box_location_id",
        "ammo_box",
        "locations",
        ["location_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_ammo_box_location_id", "ammo_box", type_="foreignkey")
    op.drop_column("ammo_box", "location_id")
