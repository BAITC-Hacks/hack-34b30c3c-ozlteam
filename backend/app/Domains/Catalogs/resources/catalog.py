from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CatalogResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    external_id: str
    source_revision: int
    source_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime
    name: str
    active: bool


class CategoryResource(CatalogResource):
    review_days: int
    safety_days: int


class SupplierResource(CatalogResource):
    pass


class WarehouseResource(CatalogResource):
    organization_external_id: str | None


class ProductResource(CatalogResource):
    sku: str
    code: str | None
    category_id: UUID | None
    supplier_id: UUID | None
    characteristic_external_id: str | None
    unit: str
    pack_size: Decimal
    min_order_qty: Decimal
    lead_time_days: int | None


CatalogOutput = ProductResource | CategoryResource | WarehouseResource | SupplierResource
RESOURCES = {
    "products": ProductResource,
    "categories": CategoryResource,
    "warehouses": WarehouseResource,
    "suppliers": SupplierResource,
}
