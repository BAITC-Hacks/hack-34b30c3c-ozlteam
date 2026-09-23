from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Nonnegative = Annotated[Decimal, Field(ge=0, max_digits=20, decimal_places=6)]
LeadDays = Annotated[int, Field(ge=0, le=3650)]


class StockOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: Nonnegative
    reserved: Nonnegative = Decimal(0)
    warehouse: str = Field(min_length=1, max_length=150)
    as_of: date

    @model_validator(mode="after")
    def reserve_fits(self):
        if self.reserved > self.quantity:
            raise ValueError("Резерв превышает остаток")
        return self


class PackageOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    as_of: date = date(2026, 9, 22)
    revision: int = Field(default=1, ge=1)
    history_start: date = date(2025, 1, 1)
    lead_time_days: LeadDays | None = None
    lead_time_days_by_supplier: dict[str, LeadDays] = Field(default_factory=dict)
    warehouse_mapping: dict[str, str] = Field(default_factory=dict)
    negative_sales_policy: Literal["quarantine", "signed_returns"] = "quarantine"
    moq_semantics: Literal["minimum", "pack"] | None = None
    stock_overrides: dict[str, StockOverride] = Field(default_factory=dict)
    unit_overrides: dict[str, str] = Field(default_factory=dict)
    purchase_conversions: dict[str, Annotated[Decimal, Field(gt=0)]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.history_start > self.as_of:
            raise ValueError("Начало истории позже даты среза")
        return self
