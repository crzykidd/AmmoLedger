"""add product_name to ammo_box

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-25

"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.add_column(sa.Column("product_name", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ammo_box") as batch_op:
        batch_op.drop_column("product_name")
