"""add firearm lookups (P1a foundation)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-09

Adds the community-curated lookup foundation for the firearms feature
(P1b will add the firearms table itself):

- manufacturers.types JSON column (existing rows backfilled to '["ammo"]')
- firearm_action_types  (community-curated; e.g. semi-auto pistol, revolver)
- firearm_models        (community-curated; FK manufacturer + caliber + action)
- firearm_compliance_tags (community-curated; jurisdiction-status tags)
- firearm_user_tags     (per-user, free-form colored tags)
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. Extend manufacturers with a `types` JSON column.
    #    Existing rows backfilled to '["ammo"]' so the unfiltered
    #    /lookups/manufacturers response is unchanged for ammo-only callers.
    # -------------------------------------------------------------------------

    op.add_column(
        "manufacturers",
        sa.Column("types", sa.Text(), nullable=True),
    )
    op.execute(
        "UPDATE manufacturers SET types = '[\"ammo\"]' WHERE types IS NULL"
    )

    # -------------------------------------------------------------------------
    # 2. firearm_action_types — referenced by firearm_models, must come first.
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_action_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # -------------------------------------------------------------------------
    # 3. firearm_models — FK manufacturers, calibers, firearm_action_types.
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("manufacturer_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("default_caliber_id", sa.Integer(), nullable=True),
        sa.Column("default_action_type_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["manufacturer_id"], ["manufacturers.id"]),
        sa.ForeignKeyConstraint(["default_caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["default_action_type_id"], ["firearm_action_types.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manufacturer_id", "name", name="uq_firearm_models_mfr_name"),
    )
    # FK indexes (per project DB rule — add in same migration as the FK column).
    op.create_index(
        "ix_firearm_models_manufacturer_id",
        "firearm_models",
        ["manufacturer_id"],
    )
    op.create_index(
        "ix_firearm_models_default_caliber_id",
        "firearm_models",
        ["default_caliber_id"],
    )
    op.create_index(
        "ix_firearm_models_default_action_type_id",
        "firearm_models",
        ["default_action_type_id"],
    )

    # -------------------------------------------------------------------------
    # 4. firearm_compliance_tags — community-curated jurisdiction tags.
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_compliance_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("jurisdiction", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="community"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # -------------------------------------------------------------------------
    # 5. firearm_user_tags — per-user free-form colored tags (NOT community).
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_user_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "name", name="uq_firearm_user_tags_owner_name"),
    )
    op.create_index(
        "ix_firearm_user_tags_owner_id",
        "firearm_user_tags",
        ["owner_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_firearm_user_tags_owner_id", table_name="firearm_user_tags")
    op.drop_table("firearm_user_tags")

    op.drop_table("firearm_compliance_tags")

    op.drop_index("ix_firearm_models_default_action_type_id", table_name="firearm_models")
    op.drop_index("ix_firearm_models_default_caliber_id",     table_name="firearm_models")
    op.drop_index("ix_firearm_models_manufacturer_id",        table_name="firearm_models")
    op.drop_table("firearm_models")

    op.drop_table("firearm_action_types")

    # SQLite supports DROP COLUMN since 3.35 (Alembic uses batch_alter_table for older).
    with op.batch_alter_table("manufacturers") as batch:
        batch.drop_column("types")
