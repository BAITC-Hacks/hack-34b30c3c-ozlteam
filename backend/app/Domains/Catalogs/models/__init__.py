from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.core.database import Base


class SourceRecord:
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(200))
    source_revision: Mapped[int]
    payload_hash: Mapped[str] = mapped_column(String(64))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @declared_attr.directive
    def __table_args__(cls):
        return (UniqueConstraint("source_id", "external_id"),)


class Category(SourceRecord, Base):
    __tablename__ = "catalog_categories"
    name: Mapped[str] = mapped_column(String(300))
    review_days: Mapped[int] = mapped_column(default=7)
    safety_days: Mapped[int] = mapped_column(default=7)
    active: Mapped[bool] = mapped_column(default=True)


class Supplier(SourceRecord, Base):
    __tablename__ = "catalog_suppliers"
    name: Mapped[str] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(default=True)


class Warehouse(SourceRecord, Base):
    __tablename__ = "catalog_warehouses"
    name: Mapped[str] = mapped_column(String(300))
    organization_external_id: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(default=True)


class Product(SourceRecord, Base):
    __tablename__ = "catalog_products"
    sku: Mapped[str] = mapped_column(String(200), index=True)
    code: Mapped[str | None] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(500))
    category_id: Mapped[UUID | None] = mapped_column(ForeignKey("catalog_categories.id"))
    supplier_id: Mapped[UUID | None] = mapped_column(ForeignKey("catalog_suppliers.id"))
    characteristic_external_id: Mapped[str | None] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(30))
    pack_size: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=1)
    min_order_qty: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0)
    lead_time_days: Mapped[int | None]
    active: Mapped[bool] = mapped_column(default=True)
