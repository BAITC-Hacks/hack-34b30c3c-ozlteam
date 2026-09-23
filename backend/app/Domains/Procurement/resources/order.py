from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Resource(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LineOut(Resource):
    id: UUID
    recommendation_id: UUID | None = Field(description="Рекомендация; null для ручной строки.")
    run_id: UUID | None = Field(description="Расчёт рекомендации; null для ручной строки.")
    product_id: UUID
    sku: str
    name: str
    unit: str
    recommended_quantity: Decimal | None = Field(
        description="Исходное количество алгоритма; null, если количество указал пользователь."
    )
    quantity: Decimal
    reason: str


class ExternalReference(BaseModel):
    id: UUID
    source_id: UUID
    external_id: str
    name: str


class ProductReference(ExternalReference):
    code: str | None = None
    sku: str
    unit: str
    characteristic_external_id: str | None = None


class ExternalReferences(BaseModel):
    supplier: ExternalReference
    warehouse: ExternalReference
    products: list[ProductReference]


class OrderOut(Resource):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    warehouse_id: UUID
    status: Literal["draft", "approved"]
    version: int
    revision: int
    supersedes_order_id: UUID | None = None
    comment: str
    external_references: ExternalReferences
    created_by: UUID
    created_at: datetime
    approved_by: UUID | None
    approved_at: datetime | None
    lines: list[LineOut]


class AuditOut(Resource):
    id: UUID
    actor_id: UUID
    action: str
    data: dict
    created_at: datetime


class DeliveryOut(Resource):
    order_id: UUID
    revision: int
    status: Literal["pending", "accepted", "rejected"]
    external_document_id: str | None
    message: str
    acknowledged_by: UUID | None
    acknowledged_at: datetime | None


class HandoffOut(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    idempotency_key: str
    order: OrderOut
    delivery: DeliveryOut
