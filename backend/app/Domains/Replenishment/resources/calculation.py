from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.Domains.Replenishment.DTO.calculation import CalculationParameters


class SourceVersion(BaseModel):
    source_id: UUID
    revision: int
    cursor: str | None = None
    synced_at: datetime | None = None
    complete: bool


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    warehouse_id: UUID
    category_id: UUID | None
    as_of: date
    status: Literal["queued", "running", "done", "failed"]
    algorithm_version: str
    parameters: CalculationParameters
    source_versions: list[SourceVersion]
    warnings: list[str]
    error: str | None
    job_id: UUID | None
    created_by: UUID
    created_at: datetime
    completed_at: datetime | None


class RunPage(BaseModel):
    items: list[RunOut]
    total: int
    limit: int
    offset: int


class Breakdown(BaseModel):
    lead_time_days: int
    review_days: int
    horizon_days: int
    safety_days: int
    forecast_quantity: Decimal
    safety_stock: Decimal
    available_stock: Decimal
    inbound_quantity: Decimal
    unrounded_quantity: Decimal
    rounding_increment: Decimal
    recommended_quantity: Decimal
    lost_demand: Decimal
    baseline_daily: Decimal
    trend_daily_slope: Decimal
    seasonality_method: Literal["product_monthly", "category_monthly", "flat_short_history"]
    shortage_date: date | None
    excess_quantity: Decimal
    raw_sales: Decimal
    corrected_sales: Decimal
    excluded_quantity: Decimal


class ForecastPoint(BaseModel):
    date: date
    quantity: Decimal
    seasonal_factor: Decimal
    trend_increment: Decimal
    growth_rate: Decimal
    growth_mode: Literal["additional", "replace_trend"]


class HistoryPoint(BaseModel):
    date: date
    raw: Decimal
    corrected: Decimal
    stockout: bool


class ExcludedSale(BaseModel):
    date: date
    client_id: str | None
    quantity: Decimal
    threshold: Decimal
    reason: str


class InboundPoint(BaseModel):
    product_id: UUID
    expected_date: date
    quantity: Decimal
    status: str


class RecommendationDetails(BaseModel):
    breakdown: Breakdown
    warnings: list[str]
    forecast: list[ForecastPoint]
    history: list[HistoryPoint]
    excluded_sales: list[ExcludedSale]
    inbound: list[InboundPoint]


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    product_id: UUID
    supplier_id: UUID | None
    warehouse_id: UUID
    sku: str
    name: str
    unit: str
    recommended_quantity: Decimal
    status: Literal["ready", "blocked"]
    urgency: Literal["none", "normal", "high", "critical"]
    explanation: str


class RecommendationDetailOut(RecommendationOut):
    details: RecommendationDetails


class SupplierGroup(BaseModel):
    supplier_id: UUID | None
    items: list[RecommendationOut]


class RecommendationPage(BaseModel):
    items: list[RecommendationOut]
    supplier_groups: list[SupplierGroup] = Field(description="Группы строк текущей страницы")
    total: int
    limit: int
    offset: int


class OverviewOut(BaseModel):
    latest_run: RunOut | None
    deficit_count: int
    excess_count: int
    blocked_count: int
    draft_order_count: int
    source_versions: list[SourceVersion]
    warnings: list[str]
