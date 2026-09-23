from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, TypeAdapter, model_validator

Quantity = Annotated[Decimal, Field(ge=0, max_digits=20, decimal_places=6)]
ExternalId = Annotated[str, Field(min_length=1, max_length=200)]


class SourceRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    external_id: ExternalId = Field(
        description="Стабильный ID объекта/строки в базе 1С, не артикул"
    )
    revision: int = Field(ge=1, description="Монотонная версия объекта источника")
    source_updated_at: AwareDatetime | None = None


class CategoryRow(SourceRow):
    kind: Literal["categories"] = "categories"
    name: str = Field(min_length=1, max_length=300)
    review_days: int = Field(default=7, ge=1, le=365)
    safety_days: int = Field(default=7, ge=0, le=365)
    active: bool = True


class SupplierRow(SourceRow):
    kind: Literal["suppliers"] = "suppliers"
    name: str = Field(min_length=1, max_length=300)
    active: bool = True


class WarehouseRow(SourceRow):
    kind: Literal["warehouses"] = "warehouses"
    name: str = Field(min_length=1, max_length=300)
    organization_external_id: ExternalId | None = None
    active: bool = True


class ProductRow(SourceRow):
    kind: Literal["products"] = "products"
    sku: str = Field(min_length=1, max_length=200)
    code: ExternalId | None = None
    name: str = Field(min_length=1, max_length=500)
    category_external_id: ExternalId | None = None
    supplier_external_id: ExternalId | None = None
    characteristic_external_id: ExternalId | None = None
    unit: str = Field(min_length=1, max_length=30)
    pack_size: Quantity = Field(default=Decimal(1), gt=0)
    min_order_qty: Quantity = Decimal(0)
    lead_time_days: int | None = Field(default=None, ge=0, le=3650)
    active: bool = True


class WarehouseProductRow(SourceRow):
    product_external_id: ExternalId
    warehouse_external_id: ExternalId


class SaleRow(WarehouseProductRow):
    kind: Literal["sales"] = "sales"
    date: date
    document_date: AwareDatetime | None = None
    document_id: ExternalId
    line_id: ExternalId
    quantity: Annotated[Decimal, Field(max_digits=20, decimal_places=6)] = Field(
        description="Количество в базовых единицах; возврат отрицательный"
    )
    price: Quantity | None = None
    client_id: str | None = Field(
        default=None,
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Только обезличенный непрозрачный ID; ФИО, телефон, email запрещены",
    )
    status: Literal["posted", "cancelled"] = "posted"


class StockRow(WarehouseProductRow):
    kind: Literal["stocks"] = "stocks"
    as_of: AwareDatetime
    quantity: Quantity
    reserved: Quantity = Decimal(0)

    @model_validator(mode="after")
    def valid_reserved(self):
        if self.reserved > self.quantity:
            raise ValueError("Резерв превышает остаток")
        return self


class InboundRow(WarehouseProductRow):
    kind: Literal["inbound"] = "inbound"
    supplier_external_id: ExternalId | None = None
    document_id: ExternalId
    expected_date: date
    quantity: Quantity = Field(description="Ещё не полученное количество в базовых единицах")
    status: Literal["confirmed", "in_transit", "received", "cancelled"] = "confirmed"


class StockoutRow(WarehouseProductRow):
    kind: Literal["stockouts"] = "stockouts"
    start: date
    end: date | None = None
    active: bool = Field(
        default=True, description="false отменяет ошибочный интервал новой версией"
    )

    @model_validator(mode="after")
    def valid_interval(self):
        if self.end is not None and self.end < self.start:
            raise ValueError("Конец stockout раньше начала")
        return self


class GrowthRow(SourceRow):
    kind: Literal["growth"] = "growth"
    product_external_id: ExternalId | None = None
    category_external_id: ExternalId | None = None
    start: date
    end: date
    rate: Annotated[Decimal, Field(ge=-1, le=10, max_digits=12, decimal_places=6)]
    mode: Literal["additional", "replace_trend"] = "additional"
    active: bool = Field(default=True, description="false отменяет прогноз новой версией")

    @model_validator(mode="after")
    def valid_scope(self):
        if bool(self.product_external_id) == bool(self.category_external_id):
            raise ValueError("Укажите ровно один объект: товар или категория")
        if self.end < self.start:
            raise ValueError("Конец прогноза раньше начала")
        return self


DataRow = Annotated[
    CategoryRow
    | SupplierRow
    | WarehouseRow
    | ProductRow
    | SaleRow
    | StockRow
    | InboundRow
    | StockoutRow
    | GrowthRow,
    Field(discriminator="kind"),
]
ROW_ADAPTER = TypeAdapter(DataRow)
KINDS = (
    "categories",
    "suppliers",
    "warehouses",
    "products",
    "sales",
    "stocks",
    "inbound",
    "stockouts",
    "growth",
)


def json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value
