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
    try:
        op.add_column(
            "ammo_box",
            sa.Column(
                "location_id",
                sa.Integer(),
                sa.ForeignKey("locations.id"),
                nullable=True,
            ),
        )
    except Exception:
        pass  # column already exists


def downgrade() -> None:
    op.drop_column("ammo_box", "location_id")
