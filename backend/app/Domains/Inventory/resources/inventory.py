from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class InventoryResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    external_id: str
    source_revision: int
    source_updated_at: datetime | None
    updated_at: datetime


class SaleResource(InventoryResource):
    product_id: UUID
    warehouse_id: UUID
    date: date
    document_date: datetime | None
    document_id: str
    line_id: str
    quantity: Decimal
    price: Decimal | None
    client_id: str | None
    status: str


class StockResource(InventoryResource):
    product_id: UUID
    warehouse_id: UUID
    as_of: datetime
    quantity: Decimal
    reserved: Decimal


class InboundResource(InventoryResource):
    product_id: UUID
    warehouse_id: UUID
    supplier_id: UUID | None
    document_id: str
    expected_date: date
    quantity: Decimal
    status: str


class StockoutResource(InventoryResource):
    product_id: UUID
    warehouse_id: UUID
    start: date
    end: date | None
    active: bool


class GrowthResource(InventoryResource):
    product_id: UUID | None
    category_id: UUID | None
    start: date
    end: date
    rate: Decimal
    mode: str
    active: bool


InventoryOutput = SaleResource | StockResource | InboundResource | StockoutResource | GrowthResource
RESOURCES = {
    "sales": SaleResource,
    "stocks": StockResource,
    "inbound": InboundResource,
    "stockouts": StockoutResource,
    "growth": GrowthResource,
}
