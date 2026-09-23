"""Manual supplier drafts and audited soft deletion.

Revision ID: c381c7a048dd
Revises: 75bdae661182
"""

import sqlalchemy as sa
from alembic import op

revision = "c381c7a048dd"
down_revision = "75bdae661182"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "procurement_orders", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.alter_column(
        "procurement_order_lines", "recommendation_id", existing_type=sa.Uuid(), nullable=True
    )
    op.alter_column("procurement_order_lines", "run_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column(
        "procurement_order_lines",
        "recommended_quantity",
        existing_type=sa.Numeric(20, 6),
        nullable=True,
    )
    op.drop_constraint("ck_order_line_quantity", "procurement_order_lines", type_="check")
    op.create_check_constraint(
        "ck_order_line_quantity",
        "procurement_order_lines",
        "quantity > 0 AND (recommended_quantity IS NULL OR recommended_quantity > 0)",
    )
    op.create_check_constraint(
        "ck_order_line_origin",
        "procurement_order_lines",
        "(recommendation_id IS NULL AND run_id IS NULL AND recommended_quantity IS NULL) "
        "OR (recommendation_id IS NOT NULL AND run_id IS NOT NULL "
        "AND recommended_quantity IS NOT NULL)",
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM procurement_order_lines WHERE recommendation_id IS NULL) "
            "OR EXISTS (SELECT 1 FROM procurement_orders WHERE deleted_at IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "Cannot downgrade while manual order lines or deleted drafts exist; "
            "preserve these records before reverting."
        )
    op.drop_constraint("ck_order_line_origin", "procurement_order_lines", type_="check")
    op.drop_constraint("ck_order_line_quantity", "procurement_order_lines", type_="check")
    op.create_check_constraint(
        "ck_order_line_quantity",
        "procurement_order_lines",
        "quantity > 0 AND recommended_quantity > 0",
    )
    op.alter_column(
        "procurement_order_lines",
        "recommended_quantity",
        existing_type=sa.Numeric(20, 6),
        nullable=False,
    )
    op.alter_column("procurement_order_lines", "run_id", existing_type=sa.Uuid(), nullable=False)
    op.alter_column(
        "procurement_order_lines", "recommendation_id", existing_type=sa.Uuid(), nullable=False
    )
    op.drop_column("procurement_orders", "deleted_at")
