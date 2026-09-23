"""Business fields for local catalog maintenance; source identity is server-owned."""

from decimal import Decimal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class ManualFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=500)
    active: bool | None = None
    sku: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=1, max_length=200)
    category_id: UUID | None = None
    supplier_id: UUID | None = None
    characteristic_external_id: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    pack_size: Decimal | None = Field(default=None, gt=0, max_digits=20, decimal_places=6)
    min_order_qty: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=6)
    lead_time_days: int | None = Field(default=None, ge=1, le=730)
    review_days: int | None = Field(default=None, ge=1, le=365)
    safety_days: int | None = Field(default=None, ge=0, le=365)
    organization_external_id: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def no_null_required_values(self):
        for key in {
            "name",
            "active",
            "sku",
            "unit",
            "pack_size",
            "min_order_qty",
            "review_days",
            "safety_days",
        } & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError(f"{key} не может быть null")
        return self


class ManualCreate(ManualFields):
    name: str = Field(min_length=1, max_length=500, description="Название объекта")
    source_id: UUID | None = Field(
        default=None, description="Существующий источник; без значения — ручной источник сервиса"
    )


class ManualPatch(ManualFields):
    expected_updated_at: AwareDatetime = Field(
        description="updated_at последнего GET; конфликт изменений возвращает 409"
    )


FIELDS = {
    "suppliers": {"name", "active"},
    "categories": {"name", "active", "review_days", "safety_days"},
    "warehouses": {"name", "active", "organization_external_id"},
    "products": {
        "name",
        "active",
        "sku",
        "code",
        "category_id",
        "supplier_id",
        "characteristic_external_id",
        "unit",
        "pack_size",
        "min_order_qty",
        "lead_time_days",
    },
}
