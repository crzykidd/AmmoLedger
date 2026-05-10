"""firearm photos

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-10

Adds the `firearm_photos` table for the per-firearm photo gallery feature
(up to 5 photos per firearm, with one designated default). Files live on
disk under ${UPLOADS_PATH}/firearm_photos/<firearm_id>/; this table only
stores metadata + a server-generated `filename` that maps to the on-disk
files.

The 5-photos-per-firearm cap is enforced at the API layer, not the DB,
so it can be tuned later without a migration. The DB does enforce
"at-most-one is_default=true per firearm" via a SQLite partial unique
index.
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "firearm_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("firearm_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("original_name", sa.Text(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["firearm_id"], ["firearms.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_firearm_photos_firearm_id",
        "firearm_photos",
        ["firearm_id"],
    )
    op.create_index(
        "ix_firearm_photos_uploaded_by",
        "firearm_photos",
        ["uploaded_by"],
    )

    # Partial unique index — at most one is_default=true per firearm.
    # SQLite supports partial indexes (3.8.0+, 2013).
    op.execute(
        "CREATE UNIQUE INDEX ix_firearm_photos_default_per_firearm "
        "ON firearm_photos (firearm_id) WHERE is_default = 1"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_firearm_photos_default_per_firearm")
    op.drop_index("ix_firearm_photos_uploaded_by", table_name="firearm_photos")
    op.drop_index("ix_firearm_photos_firearm_id", table_name="firearm_photos")
    op.drop_table("firearm_photos")
