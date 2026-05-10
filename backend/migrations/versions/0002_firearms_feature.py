"""firearms feature (v0.3.0) — collapsed

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-10

Pre-release polish: combines what would have been three separate
migrations (firearm lookups, firearms registry, range sessions) into
one. Same final schema, one diff to review, matches the v0.1.9 squash
precedent. v0.3.0 has not been released yet so there is no migration
history that needs preserving.

What this creates / changes
---------------------------
- manufacturers.types JSON column (existing rows backfilled to '["ammo"]')
- firearm_action_types       — community-curated; e.g. semi-auto pistol
- firearm_frame_sizes        — community-curated; Micro / Compact / etc.
- firearm_optic_cuts         — community-curated; RMR / DeltaPoint / etc.
- firearm_rail_types         — community-curated; Picatinny / M-LOK / etc.
- firearm_finishes           — community-curated; Cerakote / Blued / etc.
- firearm_models             — community-curated; FK manufacturer + caliber + action
                               + default_barrel_length_in
- firearm_compliance_tags    — community-curated; jurisdiction-status tags
- firearm_user_tags          — per-user free-form colored tags
- firearms                   — registry with FKs to all of the above
                               + frame_size_id / optic_cut_id / rail_type_id
                               + finish_id / standard_capacity
                               (no free-text `finish` column — replaced by FK)
- firearm_log                — cleaning | service | note events
- firearm_compliance_tag_links / firearm_user_tag_links — m2m link tables
- range_sessions             — session header
- range_session_lines        — one row per firearm/box pairing in a session
- expenditure_log.range_session_line_id — bidirectional audit FK so deleting
                                          a session line reverses the
                                          deduction it created

Schema rules per project DB policy:
- Every FK column gets its index in the same migration.
- The CHECK constraint on `firearms` (model OR custom_name) is enforced at
  both the DB and API layers.
- Down migration drops in reverse FK order, then drops the
  `manufacturers.types` column.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Helpers — the four physical-attribute lookups all share the same shape.
# ---------------------------------------------------------------------------

def _create_attr_lookup(table_name: str) -> None:
    """Create one of the simple firearm attribute lookup tables.

    Same shape as firearm_action_types: id / unique name / is_active / source /
    community_key / is_imported. No FKs; no FK indexes needed.
    """
    op.create_table(
        table_name,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )


def upgrade() -> None:
    # =========================================================================
    # 1. Extend manufacturers with a `types` JSON column.
    #    Existing rows backfilled to '["ammo"]' so the unfiltered
    #    /lookups/manufacturers response is unchanged for ammo-only callers.
    # =========================================================================

    op.add_column(
        "manufacturers",
        sa.Column("types", sa.Text(), nullable=True),
    )
    op.execute(
        "UPDATE manufacturers SET types = '[\"ammo\"]' WHERE types IS NULL"
    )

    # =========================================================================
    # 2. Lookups with no FKs — must come before firearm_models / firearms.
    # =========================================================================

    _create_attr_lookup("firearm_action_types")
    _create_attr_lookup("firearm_frame_sizes")
    _create_attr_lookup("firearm_optic_cuts")
    _create_attr_lookup("firearm_rail_types")
    _create_attr_lookup("firearm_finishes")

    # =========================================================================
    # 3. firearm_models — FK manufacturers / calibers / firearm_action_types,
    #    plus the new default_barrel_length_in column for the form drawer
    #    auto-fill cascade.
    # =========================================================================

    op.create_table(
        "firearm_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("manufacturer_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("default_caliber_id", sa.Integer(), nullable=True),
        sa.Column("default_action_type_id", sa.Integer(), nullable=True),
        sa.Column("default_barrel_length_in", sa.Float(), nullable=True),
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

    # =========================================================================
    # 4. firearm_compliance_tags — community-curated jurisdiction tags.
    # =========================================================================

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

    # =========================================================================
    # 5. firearm_user_tags — per-user free-form colored tags (NOT community).
    # =========================================================================

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

    # =========================================================================
    # 6. firearms — the registry itself.
    #    No free-text `finish` column; finish is now an FK to firearm_finishes.
    # =========================================================================

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

        # Physical attribute FKs — replace the previous free-text `finish`.
        sa.Column("frame_size_id", sa.Integer(), nullable=True),
        sa.Column("optic_cut_id", sa.Integer(), nullable=True),
        sa.Column("rail_type_id", sa.Integer(), nullable=True),
        sa.Column("finish_id", sa.Integer(), nullable=True),
        sa.Column("standard_capacity", sa.Integer(), nullable=True),

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
        sa.ForeignKeyConstraint(["frame_size_id"], ["firearm_frame_sizes.id"]),
        sa.ForeignKeyConstraint(["optic_cut_id"], ["firearm_optic_cuts.id"]),
        sa.ForeignKeyConstraint(["rail_type_id"], ["firearm_rail_types.id"]),
        sa.ForeignKeyConstraint(["finish_id"], ["firearm_finishes.id"]),
        sa.ForeignKeyConstraint(["dealer_id"], ["dealers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "firearm_model_id IS NOT NULL OR custom_model_name IS NOT NULL",
            name="ck_firearm_model_or_custom",
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
    op.create_index("ix_firearms_frame_size_id",    "firearms", ["frame_size_id"])
    op.create_index("ix_firearms_optic_cut_id",     "firearms", ["optic_cut_id"])
    op.create_index("ix_firearms_rail_type_id",     "firearms", ["rail_type_id"])
    op.create_index("ix_firearms_finish_id",        "firearms", ["finish_id"])
    op.create_index("ix_firearms_dealer_id",        "firearms", ["dealer_id"])

    # =========================================================================
    # 7. firearm_log — per-firearm event log (cleaning | service | note).
    # =========================================================================

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

    # =========================================================================
    # 8. firearm_compliance_tag_links — m2m firearms <-> firearm_compliance_tags.
    # =========================================================================

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

    # =========================================================================
    # 9. firearm_user_tag_links — m2m firearms <-> firearm_user_tags.
    # =========================================================================

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

    # =========================================================================
    # 10. range_sessions — session header.
    # =========================================================================

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

    # =========================================================================
    # 11. range_session_lines — one row per firearm/ammo-box pairing.
    # =========================================================================

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

    # =========================================================================
    # 12. expenditure_log.range_session_line_id — bidirectional audit link.
    # =========================================================================

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
    # Drop in reverse FK-safe order.

    # expenditure_log audit FK
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

    # Range sessions
    op.drop_index("ix_range_session_lines_ammo_box_id", table_name="range_session_lines")
    op.drop_index("ix_range_session_lines_firearm_id",  table_name="range_session_lines")
    op.drop_index("ix_range_session_lines_session_id",  table_name="range_session_lines")
    op.drop_table("range_session_lines")

    op.drop_index("ix_range_sessions_date",      table_name="range_sessions")
    op.drop_index("ix_range_sessions_is_shared", table_name="range_sessions")
    op.drop_index("ix_range_sessions_owner_id",  table_name="range_sessions")
    op.drop_table("range_sessions")

    # Firearm tag links
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

    # Firearm log
    op.drop_index("ix_firearm_log_logged_by",  table_name="firearm_log")
    op.drop_index("ix_firearm_log_event_type", table_name="firearm_log")
    op.drop_index("ix_firearm_log_event_date", table_name="firearm_log")
    op.drop_index("ix_firearm_log_firearm_id", table_name="firearm_log")
    op.drop_table("firearm_log")

    # Firearms registry
    op.drop_index("ix_firearms_dealer_id",        table_name="firearms")
    op.drop_index("ix_firearms_finish_id",        table_name="firearms")
    op.drop_index("ix_firearms_rail_type_id",     table_name="firearms")
    op.drop_index("ix_firearms_optic_cut_id",     table_name="firearms")
    op.drop_index("ix_firearms_frame_size_id",    table_name="firearms")
    op.drop_index("ix_firearms_action_type_id",   table_name="firearms")
    op.drop_index("ix_firearms_firearm_type",     table_name="firearms")
    op.drop_index("ix_firearms_caliber_id",       table_name="firearms")
    op.drop_index("ix_firearms_firearm_model_id", table_name="firearms")
    op.drop_index("ix_firearms_manufacturer_id",  table_name="firearms")
    op.drop_index("ix_firearms_is_shared",        table_name="firearms")
    op.drop_index("ix_firearms_owner_id",         table_name="firearms")
    op.drop_table("firearms")

    # Per-user firearm tags
    op.drop_index("ix_firearm_user_tags_owner_id", table_name="firearm_user_tags")
    op.drop_table("firearm_user_tags")

    # Compliance tags
    op.drop_table("firearm_compliance_tags")

    # firearm_models
    op.drop_index("ix_firearm_models_default_action_type_id", table_name="firearm_models")
    op.drop_index("ix_firearm_models_default_caliber_id",     table_name="firearm_models")
    op.drop_index("ix_firearm_models_manufacturer_id",        table_name="firearm_models")
    op.drop_table("firearm_models")

    # Physical attribute lookups
    op.drop_table("firearm_finishes")
    op.drop_table("firearm_rail_types")
    op.drop_table("firearm_optic_cuts")
    op.drop_table("firearm_frame_sizes")
    op.drop_table("firearm_action_types")

    # manufacturers.types column
    with op.batch_alter_table("manufacturers") as batch:
        batch.drop_column("types")
