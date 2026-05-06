"""add database indexes for search and filter performance

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-25

"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

_INDEXES = [
    # ammo_box
    ("ix_ammo_box_caliber_id",      "ammo_box",        ["caliber_id"]),
    ("ix_ammo_box_manufacturer_id", "ammo_box",        ["manufacturer_id"]),
    ("ix_ammo_box_type_id",         "ammo_box",        ["type_id"]),
    ("ix_ammo_box_category_id",     "ammo_box",        ["category_id"]),
    ("ix_ammo_box_owner_id",        "ammo_box",        ["owner_id"]),
    ("ix_ammo_box_is_shared",       "ammo_box",        ["is_shared"]),
    ("ix_ammo_box_qty_remaining",   "ammo_box",        ["qty_remaining"]),
    ("ix_ammo_box_is_archived",     "ammo_box",        ["is_archived"]),
    ("ix_ammo_box_created_at",      "ammo_box",        ["created_at"]),
    ("ix_ammo_box_legacy_id",       "ammo_box",        ["legacy_id"]),
    ("ix_ammo_box_split_from_id",   "ammo_box",        ["split_from_id"]),
    # expenditure_log
    ("ix_explog_ammo_box_id",       "expenditure_log", ["ammo_box_id"]),
    ("ix_explog_logged_by",         "expenditure_log", ["logged_by"]),
    ("ix_explog_date",              "expenditure_log", ["date"]),
    ("ix_explog_log_type",          "expenditure_log", ["log_type"]),
    # users
    ("ix_users_username",           "users",           ["username"]),
    ("ix_users_email",              "users",           ["email"]),
    # app_settings
    ("ix_app_settings_key",         "app_settings",    ["key"]),
    # invitations
    ("ix_invitations_token",        "invitations",     ["token"]),
    ("ix_invitations_expires_at",   "invitations",     ["expires_at"]),
    ("ix_invitations_is_revoked",   "invitations",     ["is_revoked"]),
    # notifications
    ("ix_notifications_user_id",    "notifications",   ["user_id"]),
    ("ix_notifications_is_read",    "notifications",   ["is_read"]),
    ("ix_notifications_created_at", "notifications",   ["created_at"]),
]


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _cols in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
