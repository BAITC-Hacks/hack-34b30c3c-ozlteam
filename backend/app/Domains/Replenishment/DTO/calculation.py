from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CalculationParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    history_days: int = Field(default=1095, ge=28, le=3650, description="Глубина истории в днях")


class CreateCalculation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warehouse_id: UUID = Field(description="Внутренний UUID склада из справочника")
    category_id: UUID | None = Field(default=None, description="Без значения — все категории")
    as_of: date = Field(description="Дата среза включительно; прогноз начинается на следующий день")
    idempotency_key: str = Field(
        min_length=1, max_length=100, description="Ключ повторного запроса"
    )
    parameters: CalculationParameters = Field(default_factory=CalculationParameters)

    @field_validator("as_of")
    @classmethod
    def no_future_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Дата среза не может быть в будущем")
        return value


class InputRow(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Product(InputRow):
    sku: str = Field(min_length=1, description="Уникальный артикул товара")
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    supplier_id: str = Field(min_length=1)


class Supplier(InputRow):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    lead_days: int = Field(ge=1, le=365, description="Срок поставки в календарных днях")
    min_order_qty: int = Field(ge=1, description="Минимальная партия в штуках")


class Sale(InputRow):
    date: date
    sku: str = Field(min_length=1)
    warehouse: str = Field(min_length=1)
    customer_id: str = Field(min_length=1, description="Только обезличенный идентификатор")
    quantity: int = Field(gt=0)
    price: float = Field(ge=0)


class Stock(InputRow):
    sku: str = Field(min_length=1)
    warehouse: str = Field(min_length=1)
    quantity: int = Field(ge=0)


class Inbound(InputRow):
    sku: str = Field(min_length=1)
    warehouse: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    eta: date


class Stockout(InputRow):
    sku: str = Field(min_length=1)
    warehouse: str = Field(min_length=1)
    start: date
    end: date

    @model_validator(mode="after")
    def check_interval(self):
        if self.end < self.start:
            raise ValueError("stockout end must be on or after start")
        return self


class CategoryGrowth(InputRow):
    category: str = Field(min_length=1)
    growth_pct: float = Field(ge=-0.95, le=3, description="0.08 означает рост на 8%")


class CalculationInput(InputRow):
    as_of: date = Field(description="Дата расчёта; будущие продажи игнорируются")
    review_days: int = Field(default=14, ge=1, le=90)
    products: list[Product]
    suppliers: list[Supplier]
    sales: list[Sale]
    stock: list[Stock]
    inbound: list[Inbound]
    stockouts: list[Stockout]
    category_growth: list[CategoryGrowth]

    @model_validator(mode="after")
    def check_references(self):
        product_ids = {row.sku for row in self.products}
        supplier_ids = {row.id for row in self.suppliers}
        categories = {row.category for row in self.category_growth}
        for label, values in (
            ("products.sku", [row.sku for row in self.products]),
            ("suppliers.id", [row.id for row in self.suppliers]),
            ("stock.sku+warehouse", [(row.sku, row.warehouse) for row in self.stock]),
            ("category_growth.category", [row.category for row in self.category_growth]),
        ):
            if len(values) != len(set(values)):
                raise ValueError(f"duplicate {label}")
        for product in self.products:
            if product.supplier_id not in supplier_ids:
                raise ValueError(f"unknown supplier {product.supplier_id} for {product.sku}")
            if product.category not in categories:
                raise ValueError(f"missing category_growth for {product.category}")
        for source in (self.sales, self.stock, self.inbound, self.stockouts):
            for row in source:
                if row.sku not in product_ids:
                    raise ValueError(f"unknown sku {row.sku}")
        return self
