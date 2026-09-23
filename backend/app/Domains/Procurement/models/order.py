from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Order(Base):
    __tablename__ = "procurement_orders"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'approved')", name="ck_order_status"),
        CheckConstraint("version >= 1 AND revision >= 1", name="ck_order_version"),
        CheckConstraint(
            "(status = 'draft' AND approved_snapshot IS NULL AND approved_at IS NULL "
            "AND approved_by IS NULL) OR (status = 'approved' AND approved_snapshot IS NOT NULL "
            "AND approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_order_approval",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    supplier_id: Mapped[UUID] = mapped_column(index=True)
    supplier_name: Mapped[str] = mapped_column(String(500))
    warehouse_id: Mapped[UUID] = mapped_column(index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    supersedes_order_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("procurement_orders.id"), nullable=True, unique=True
    )
    comment: Mapped[str] = mapped_column(Text, default="")
    external_references: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_snapshot: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True), nullable=True)


class OrderLine(Base):
    __tablename__ = "procurement_order_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0 AND recommended_quantity > 0", name="ck_order_line_quantity"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    order_id: Mapped[UUID] = mapped_column(ForeignKey("procurement_orders.id"), index=True)
    recommendation_id: Mapped[UUID] = mapped_column(index=True)
    run_id: Mapped[UUID] = mapped_column()
    product_id: Mapped[UUID] = mapped_column()
    sku: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(1000))
    unit: Mapped[str] = mapped_column(String(100))
    recommended_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6))
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6))
    reason: Mapped[str] = mapped_column(Text, default="")


class OrderAllocation(Base):
    """Permanent claim: deleting a draft line does not silently authorize a second order."""

    __tablename__ = "procurement_order_allocations"

    recommendation_id: Mapped[UUID] = mapped_column(primary_key=True)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("procurement_orders.id"), index=True)


class OrderCreation(Base):
    __tablename__ = "procurement_order_creations"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    order_ids: Mapped[list] = mapped_column(JSONB)


class OrderAudit(Base):
    __tablename__ = "procurement_order_audits"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    order_id: Mapped[UUID] = mapped_column(ForeignKey("procurement_orders.id"), index=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrderDelivery(Base):
    __tablename__ = "procurement_order_deliveries"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="ck_order_delivery_revision"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')", name="ck_order_delivery_status"
        ),
        CheckConstraint(
            "status != 'accepted' OR external_document_id IS NOT NULL",
            name="ck_order_delivery_reference",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    order_id: Mapped[UUID] = mapped_column(ForeignKey("procurement_orders.id"), unique=True)
    revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    external_document_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    acknowledged_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
