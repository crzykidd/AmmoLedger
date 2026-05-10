"""add firearms registry + firearm log (P1b)

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-09

Adds the firearms table itself plus the per-firearm event log and the
two many-to-many tag link tables that bind firearms to the compliance
and user-tag lookups created in 0002.

Tables:
- firearms                          (the registry; owner_id + is_shared)
- firearm_log                       (cleaning | service | note events)
- firearm_compliance_tag_links      (firearms <-> firearm_compliance_tags)
- firearm_user_tag_links            (firearms <-> firearm_user_tags)

CHECK constraint on `firearms`: at least one of firearm_model_id or
custom_model_name must be present (mirrors the AmmoBox product_id /
product_name pattern).

Per project DB rule, every FK column added here gets its index in the
same migration.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # firearms — the registry itself.
    # -------------------------------------------------------------------------

    op.create_table(
        "firearms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="0"),

        sa.Column("manufacturer_id", sa.Integer(), nullable=False),
        sa.Column("firearm_model_id", sa.Integer(), nullable=True),
        sa.Column("custom_model_name", sa.Text(), nullable=True),

        sa.Column("firearm_type", sa.Text(), nullable=False),  # pistol|rifle|shotgun|other
        sa.Column("action_type_id", sa.Integer(), nullable=True),

        sa.Column("caliber_id", sa.Integer(), nullable=False),
        sa.Column("caliber_notes", sa.Text(), nullable=True),

        sa.Column("serial", sa.Text(), nullable=True),
        sa.Column("barrel_length_in", sa.Float(), nullable=True),
        sa.Column("finish", sa.Text(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("purchase_price", sa.Float(), nullable=True),
        sa.Column("dealer_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),

        sa.Column("rounds_lifetime", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rounds_since_clean", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_cleaned_at", sa.Date(), nullable=True),
        sa.Column("service_interval_rounds", sa.Integer(), nullable=True),
        sa.Column("service_interval_days", sa.Integer(), nullable=True),

        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),

        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["manufacturer_id"], ["manufacturers.id"]),
        sa.ForeignKeyConstraint(["firearm_model_id"], ["firearm_models.id"]),
        sa.ForeignKeyConstraint(["action_type_id"], ["firearm_action_types.id"]),
        sa.ForeignKeyConstraint(["caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["dealer_id"], ["dealers.id"]),
        sa.PrimaryKeyConstraint("id"),
        # Either a catalog model or a free-form custom name must be set.
        sa.CheckConstraint(
            "firearm_model_id IS NOT NULL OR custom_model_name IS NOT NULL",
            name="ck_firearms_model_or_custom_name",
        ),
    )

    # FK indexes (per DB rule — added in the same migration as the FK column).
    op.create_index("ix_firearms_owner_id",         "firearms", ["owner_id"])
    op.create_index("ix_firearms_is_shared",        "firearms", ["is_shared"])
    op.create_index("ix_firearms_manufacturer_id",  "firearms", ["manufacturer_id"])
    op.create_index("ix_firearms_firearm_model_id", "firearms", ["firearm_model_id"])
    op.create_index("ix_firearms_caliber_id",       "firearms", ["caliber_id"])
    op.create_index("ix_firearms_firearm_type",     "firearms", ["firearm_type"])
    op.create_index("ix_firearms_action_type_id",   "firearms", ["action_type_id"])
    op.create_index("ix_firearms_dealer_id",        "firearms", ["dealer_id"])

    # -------------------------------------------------------------------------
    # firearm_log — per-firearm event log (cleaning | service | note).
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("firearm_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),  # cleaning|service|note
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("rounds_at_event", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("logged_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["firearm_id"], ["firearms.id"]),
        sa.ForeignKeyConstraint(["logged_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_firearm_log_firearm_id", "firearm_log", ["firearm_id"])
    op.create_index("ix_firearm_log_event_date", "firearm_log", ["event_date"])
    op.create_index("ix_firearm_log_event_type", "firearm_log", ["event_type"])
    op.create_index("ix_firearm_log_logged_by",  "firearm_log", ["logged_by"])

    # -------------------------------------------------------------------------
    # firearm_compliance_tag_links — m2m firearms <-> firearm_compliance_tags.
    # PK on (firearm_id, tag_id) covers forward queries; tag_id index covers
    # reverse lookups ("which firearms carry this compliance tag?").
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_compliance_tag_links",
        sa.Column("firearm_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["firearm_id"], ["firearms.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["firearm_compliance_tags.id"]),
        sa.PrimaryKeyConstraint("firearm_id", "tag_id"),
    )
    op.create_index(
        "ix_firearm_compliance_tag_links_tag_id",
        "firearm_compliance_tag_links",
        ["tag_id"],
    )

    # -------------------------------------------------------------------------
    # firearm_user_tag_links — m2m firearms <-> firearm_user_tags.
    # -------------------------------------------------------------------------

    op.create_table(
        "firearm_user_tag_links",
        sa.Column("firearm_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["firearm_id"], ["firearms.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["firearm_user_tags.id"]),
        sa.PrimaryKeyConstraint("firearm_id", "tag_id"),
    )
    op.create_index(
        "ix_firearm_user_tag_links_tag_id",
        "firearm_user_tag_links",
        ["tag_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_firearm_user_tag_links_tag_id",
        table_name="firearm_user_tag_links",
    )
    op.drop_table("firearm_user_tag_links")

    op.drop_index(
        "ix_firearm_compliance_tag_links_tag_id",
        table_name="firearm_compliance_tag_links",
    )
    op.drop_table("firearm_compliance_tag_links")

    op.drop_index("ix_firearm_log_logged_by",  table_name="firearm_log")
    op.drop_index("ix_firearm_log_event_type", table_name="firearm_log")
    op.drop_index("ix_firearm_log_event_date", table_name="firearm_log")
    op.drop_index("ix_firearm_log_firearm_id", table_name="firearm_log")
    op.drop_table("firearm_log")

    op.drop_index("ix_firearms_dealer_id",        table_name="firearms")
    op.drop_index("ix_firearms_action_type_id",   table_name="firearms")
    op.drop_index("ix_firearms_firearm_type",     table_name="firearms")
    op.drop_index("ix_firearms_caliber_id",       table_name="firearms")
    op.drop_index("ix_firearms_firearm_model_id", table_name="firearms")
    op.drop_index("ix_firearms_manufacturer_id",  table_name="firearms")
    op.drop_index("ix_firearms_is_shared",        table_name="firearms")
    op.drop_index("ix_firearms_owner_id",         table_name="firearms")
    op.drop_table("firearms")
