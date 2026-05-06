"""initial schema (squashed from migrations 0001-0022)

Revision ID: 0001
Revises:
Create Date: 2026-05-05

This is the squashed initial schema as of v0.1.9. Original migrations
0001-0022 were collapsed into this single migration before the project's
first public release. See backend/migrations/archive/ for the original
migrations and docs/HISTORY.md for the rationale.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # Lookup tables (no foreign-key dependencies)
    # -------------------------------------------------------------------------

    op.create_table(
        "calibers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "manufacturers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "ammo_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "ammo_conditions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="yaml"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "dealers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.Column("community_key", sa.Text(), nullable=True),
        sa.Column("is_imported", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("types", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True, server_default="US"),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("is_standard_geo", sa.Boolean(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Users (self-referential FK on created_by — nullable, safe for SQLite)
    # -------------------------------------------------------------------------

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("first_name", sa.Text(), nullable=False, server_default=""),
        sa.Column("last_name", sa.Text(), nullable=False, server_default=""),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )

    # -------------------------------------------------------------------------
    # Containers (FK: locations)
    # -------------------------------------------------------------------------

    op.create_table(
        "containers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("source", sa.Text(), nullable=False, server_default="user"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Products (FK: calibers, manufacturers, ammo_types, categories,
    #           ammo_conditions, users)
    # -------------------------------------------------------------------------

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("caliber_id", sa.Integer(), nullable=False),
        sa.Column("manufacturer_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.Text(), nullable=True),
        sa.Column("gr_oz", sa.Float(), nullable=True),
        sa.Column("weight_unit", sa.Text(), nullable=True, server_default="GR"),
        sa.Column("type_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("ammo_condition_id", sa.Integer(), nullable=True),
        sa.Column("default_cost", sa.Float(), nullable=True),
        sa.Column("upc", sa.Text(), nullable=True),
        sa.Column("image_path", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["ammo_condition_id"], ["ammo_conditions.id"]),
        sa.ForeignKeyConstraint(["caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["manufacturer_id"], ["manufacturers.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["type_id"], ["ammo_types.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # COALESCE-based expression index — Alembic has no Python API for this
    op.execute(
        "CREATE UNIQUE INDEX ix_product_unique "
        "ON products("
        "caliber_id, manufacturer_id, "
        "COALESCE(product_name, ''), "
        "COALESCE(gr_oz, -1), "
        "COALESCE(type_id, -1))"
    )

    # -------------------------------------------------------------------------
    # AmmoBox (FK: users, calibers, manufacturers, ammo_types, ammo_conditions,
    #          categories, dealers, locations, containers, products, ammo_box)
    # -------------------------------------------------------------------------

    op.create_table(
        "ammo_box",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("caliber_id", sa.Integer(), nullable=False),
        sa.Column("manufacturer_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.Text(), nullable=True),
        sa.Column("gr_oz", sa.Float(), nullable=True),
        sa.Column("weight_unit", sa.Text(), nullable=True),
        sa.Column("type_id", sa.Integer(), nullable=True),
        sa.Column("ammo_condition_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("qty_original", sa.Integer(), nullable=False),
        sa.Column("qty_remaining", sa.Integer(), nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("cost_per_round", sa.Float(), nullable=True),
        sa.Column("dealer_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("container_id", sa.Integer(), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("legacy_id", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("split_from_id", sa.Integer(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("archive_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["ammo_condition_id"], ["ammo_conditions.id"]),
        sa.ForeignKeyConstraint(["caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["container_id"], ["containers.id"]),
        sa.ForeignKeyConstraint(["dealer_id"], ["dealers.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["manufacturer_id"], ["manufacturers.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["split_from_id"], ["ammo_box.id"]),
        sa.ForeignKeyConstraint(["type_id"], ["ammo_types.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Expenditure Log
    # -------------------------------------------------------------------------

    op.create_table(
        "expenditure_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ammo_box_id", sa.Integer(), nullable=False),
        sa.Column("logged_by", sa.Integer(), nullable=False),
        sa.Column("rounds_used", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("log_type", sa.Text(), nullable=False, server_default="expend"),
        sa.Column("related_ids", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["ammo_box_id"], ["ammo_box.id"]),
        sa.ForeignKeyConstraint(["logged_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # App Settings
    # -------------------------------------------------------------------------

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )

    # -------------------------------------------------------------------------
    # Invitations
    # -------------------------------------------------------------------------

    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_by", sa.Integer(), nullable=True),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("email_hint", sa.Text(), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["used_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )

    # -------------------------------------------------------------------------
    # Password History
    # -------------------------------------------------------------------------

    op.create_table(
        "password_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Password Reset Tokens
    # -------------------------------------------------------------------------

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )

    # -------------------------------------------------------------------------
    # Notifications
    # -------------------------------------------------------------------------

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Thresholds
    # -------------------------------------------------------------------------

    op.create_table(
        "caliber_thresholds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("caliber_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["caliber_id"], ["calibers.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("caliber_id"),
    )

    op.create_table(
        "location_thresholds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("location_id"),
    )

    # -------------------------------------------------------------------------
    # Task System
    # -------------------------------------------------------------------------

    op.create_table(
        "task_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_name", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="running"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.Text(), nullable=False, server_default="scheduler"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "task_registry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_key", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("interval_type", sa.Text(), nullable=False),
        sa.Column("interval_value", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sa.Text(), nullable=True),
        sa.Column("last_duration_ms", sa.Integer(), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # Indexes
    # -------------------------------------------------------------------------

    # ammo_box — from migrations 0009 and 0021
    op.create_index("ix_ammo_box_caliber_id",        "ammo_box", ["caliber_id"])
    op.create_index("ix_ammo_box_manufacturer_id",   "ammo_box", ["manufacturer_id"])
    op.create_index("ix_ammo_box_type_id",            "ammo_box", ["type_id"])
    op.create_index("ix_ammo_box_category_id",        "ammo_box", ["category_id"])
    op.create_index("ix_ammo_box_owner_id",           "ammo_box", ["owner_id"])
    op.create_index("ix_ammo_box_is_shared",          "ammo_box", ["is_shared"])
    op.create_index("ix_ammo_box_qty_remaining",      "ammo_box", ["qty_remaining"])
    op.create_index("ix_ammo_box_is_archived",        "ammo_box", ["is_archived"])
    op.create_index("ix_ammo_box_created_at",         "ammo_box", ["created_at"])
    op.create_index("ix_ammo_box_legacy_id",          "ammo_box", ["legacy_id"])
    op.create_index("ix_ammo_box_split_from_id",      "ammo_box", ["split_from_id"])
    op.create_index("ix_ammo_box_location_id",        "ammo_box", ["location_id"])
    op.create_index("ix_ammo_box_product_id",         "ammo_box", ["product_id"])
    op.create_index("ix_ammo_box_ammo_condition_id",  "ammo_box", ["ammo_condition_id"])
    op.create_index("ix_ammo_box_dealer_id",          "ammo_box", ["dealer_id"])
    op.create_index("ix_ammo_box_container_id",       "ammo_box", ["container_id"])

    # expenditure_log
    op.create_index("ix_explog_ammo_box_id", "expenditure_log", ["ammo_box_id"])
    op.create_index("ix_explog_logged_by",   "expenditure_log", ["logged_by"])
    op.create_index("ix_explog_date",        "expenditure_log", ["date"])
    op.create_index("ix_explog_log_type",    "expenditure_log", ["log_type"])

    # users
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email",    "users", ["email"])

    # app_settings
    op.create_index("ix_app_settings_key", "app_settings", ["key"])

    # invitations
    op.create_index("ix_invitations_token",      "invitations", ["token"])
    op.create_index("ix_invitations_expires_at", "invitations", ["expires_at"])
    op.create_index("ix_invitations_is_revoked", "invitations", ["is_revoked"])

    # notifications
    op.create_index("ix_notifications_user_id",    "notifications", ["user_id"])
    op.create_index("ix_notifications_is_read",    "notifications", ["is_read"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    # task_registry — unique index (migration 0019)
    op.create_index("ix_task_registry_task_key", "task_registry", ["task_key"], unique=True)

    # -------------------------------------------------------------------------
    # Seed data
    # -------------------------------------------------------------------------

    # Default threshold setting (from migration 0014)
    op.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) "
        "VALUES ('threshold_default_rounds', '200')"
    )


def downgrade() -> None:
    # Drop in reverse FK dependency order.
    # See backend/migrations/archive/ for the original drop sequences.

    op.drop_index("ix_task_registry_task_key",    table_name="task_registry")
    op.drop_index("ix_notifications_created_at",  table_name="notifications")
    op.drop_index("ix_notifications_is_read",     table_name="notifications")
    op.drop_index("ix_notifications_user_id",     table_name="notifications")
    op.drop_index("ix_invitations_is_revoked",    table_name="invitations")
    op.drop_index("ix_invitations_expires_at",    table_name="invitations")
    op.drop_index("ix_invitations_token",         table_name="invitations")
    op.drop_index("ix_app_settings_key",          table_name="app_settings")
    op.drop_index("ix_users_email",               table_name="users")
    op.drop_index("ix_users_username",            table_name="users")
    op.drop_index("ix_explog_log_type",           table_name="expenditure_log")
    op.drop_index("ix_explog_date",               table_name="expenditure_log")
    op.drop_index("ix_explog_logged_by",          table_name="expenditure_log")
    op.drop_index("ix_explog_ammo_box_id",        table_name="expenditure_log")
    op.drop_index("ix_ammo_box_container_id",     table_name="ammo_box")
    op.drop_index("ix_ammo_box_dealer_id",        table_name="ammo_box")
    op.drop_index("ix_ammo_box_ammo_condition_id", table_name="ammo_box")
    op.drop_index("ix_ammo_box_product_id",       table_name="ammo_box")
    op.drop_index("ix_ammo_box_location_id",      table_name="ammo_box")
    op.drop_index("ix_ammo_box_split_from_id",    table_name="ammo_box")
    op.drop_index("ix_ammo_box_legacy_id",        table_name="ammo_box")
    op.drop_index("ix_ammo_box_created_at",       table_name="ammo_box")
    op.drop_index("ix_ammo_box_is_archived",      table_name="ammo_box")
    op.drop_index("ix_ammo_box_qty_remaining",    table_name="ammo_box")
    op.drop_index("ix_ammo_box_is_shared",        table_name="ammo_box")
    op.drop_index("ix_ammo_box_owner_id",         table_name="ammo_box")
    op.drop_index("ix_ammo_box_category_id",      table_name="ammo_box")
    op.drop_index("ix_ammo_box_type_id",          table_name="ammo_box")
    op.drop_index("ix_ammo_box_manufacturer_id",  table_name="ammo_box")
    op.drop_index("ix_ammo_box_caliber_id",       table_name="ammo_box")
    op.execute("DROP INDEX IF EXISTS ix_product_unique")

    op.drop_table("task_registry")
    op.drop_table("task_history")
    op.drop_table("location_thresholds")
    op.drop_table("caliber_thresholds")
    op.drop_table("notifications")
    op.drop_table("password_reset_tokens")
    op.drop_table("password_history")
    op.drop_table("invitations")
    op.drop_table("app_settings")
    op.drop_table("expenditure_log")
    op.drop_table("ammo_box")
    op.drop_table("products")
    op.drop_table("containers")
    op.drop_table("users")
    op.drop_table("locations")
    op.drop_table("ammo_conditions")
    op.drop_table("dealers")
    op.drop_table("categories")
    op.drop_table("ammo_types")
    op.drop_table("manufacturers")
    op.drop_table("calibers")
