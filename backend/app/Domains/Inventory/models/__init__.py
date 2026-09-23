from datetime import date as DateValue
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.Domains.Catalogs.models import SourceRecord


class Sale(SourceRecord, Base):
    __tablename__ = "inventory_sales"
    product_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_products.id"), index=True)
    warehouse_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_warehouses.id"), index=True)
    date: Mapped[DateValue] = mapped_column(index=True)
    document_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    document_id: Mapped[str] = mapped_column(String(200))
    line_id: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6))
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    client_id: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(20), default="posted")


class InventorySnapshot(SourceRecord, Base):
    __tablename__ = "inventory_snapshots"
    product_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_products.id"), index=True)
    warehouse_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_warehouses.id"), index=True)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6))
    reserved: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0)


class InboundShipment(SourceRecord, Base):
    __tablename__ = "inventory_inbound"
    product_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_products.id"), index=True)
    warehouse_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_warehouses.id"), index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(ForeignKey("catalog_suppliers.id"))
    document_id: Mapped[str] = mapped_column(String(200))
    expected_date: Mapped[DateValue]
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6))
    status: Mapped[str] = mapped_column(String(20), default="confirmed")


class StockoutInterval(SourceRecord, Base):
    __tablename__ = "inventory_stockouts"
    product_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_products.id"), index=True)
    warehouse_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_warehouses.id"), index=True)
    start: Mapped[DateValue]
    end: Mapped[DateValue | None]
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))


class GrowthForecast(SourceRecord, Base):
    __tablename__ = "inventory_growth"
    product_id: Mapped[UUID | None] = mapped_column(ForeignKey("catalog_products.id"), index=True)
    category_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("catalog_categories.id"), index=True
    )
    start: Mapped[DateValue]
    end: Mapped[DateValue]
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    mode: Mapped[str] = mapped_column(String(30), default="additional")
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
