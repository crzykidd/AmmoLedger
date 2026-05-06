"""add missing FK indexes on ammo_box

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-05

Adds FK indexes for columns added in migrations 0012 (ammo_condition_id),
0017 (location_id), and 0018 (product_id), plus dealer_id and container_id
which were declared in 0001 but never indexed. These columns are used in
WHERE clauses by the lookups count map, threshold queries, and product usage
counts.
"""
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

_INDEXES = [
    ("ix_ammo_box_location_id",       "ammo_box", ["location_id"]),
    ("ix_ammo_box_product_id",        "ammo_box", ["product_id"]),
    ("ix_ammo_box_ammo_condition_id", "ammo_box", ["ammo_condition_id"]),
    ("ix_ammo_box_dealer_id",         "ammo_box", ["dealer_id"]),
    ("ix_ammo_box_container_id",      "ammo_box", ["container_id"]),
]


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _cols in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
