"""add location_id to ammo_box

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-02

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = [
        row[1] for row in
        conn.execute(text("PRAGMA table_info('ammo_box')")).fetchall()
    ]
    if "location_id" not in columns:
        op.add_column(
            "ammo_box",
            sa.Column(
                "location_id",
                sa.Integer(),
                sa.ForeignKey("locations.id"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("ammo_box", "location_id")
