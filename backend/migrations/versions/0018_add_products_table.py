"""add products table and product_id to ammo_box

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-02

"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create products table (idempotent)
    existing = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
    ).fetchone()
    if not existing:
        op.create_table(
            "products",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("caliber_id", sa.Integer(), sa.ForeignKey("calibers.id"), nullable=False),
            sa.Column("manufacturer_id", sa.Integer(), sa.ForeignKey("manufacturers.id"), nullable=False),
            sa.Column("product_name", sa.Text(), nullable=True),
            sa.Column("gr_oz", sa.Float(), nullable=True),
            sa.Column("weight_unit", sa.Text(), nullable=True, server_default="GR"),
            sa.Column("type_id", sa.Integer(), sa.ForeignKey("ammo_types.id"), nullable=True),
            sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
            sa.Column("ammo_condition_id", sa.Integer(), sa.ForeignKey("ammo_conditions.id"), nullable=True),
            sa.Column("default_cost", sa.Float(), nullable=True),
            sa.Column("upc", sa.Text(), nullable=True),
            sa.Column("image_path", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        # Composite unique index using COALESCE for null-safe keying
        conn.execute(sa.text("""
            CREATE UNIQUE INDEX ix_product_unique
            ON products(
                caliber_id,
                manufacturer_id,
                COALESCE(product_name, ''),
                COALESCE(gr_oz, -1),
                COALESCE(type_id, -1)
            )
        """))

    # Add product_id column to ammo_box (idempotent)
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(ammo_box)")).fetchall()]
    if "product_id" not in cols:
        op.add_column(
            "ammo_box",
            sa.Column(
                "product_id",
                sa.Integer(),
                sa.ForeignKey("products.id"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("ammo_box", "product_id")
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_product_unique"))
    op.drop_table("products")
