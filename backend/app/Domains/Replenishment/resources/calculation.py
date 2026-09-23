from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class CalculationMetrics(BaseModel):
    raw_sales: int = Field(description="Проданные единицы в выбранном историческом окне")
    excluded_spike_units: int = Field(description="Исключённые единицы разовых крупных заказов")
    lost_demand_units: float = Field(description="Оценка непроданного объёма в дни отсутствия")
    adjusted_daily_demand: float = Field(description="Итоговый прогноз единиц в день")
    seasonality_factor: float
    trend_factor: float
    category_growth_factor: float
    on_hand: int
    inbound: int = Field(description="Поступит в течение срока поставки и периода пересмотра")
    target_stock: int
    stock_position: int
    lead_days: int
    review_days: int


class Recommendation(BaseModel):
    sku: str
    name: str
    warehouse: str
    category: str
    supplier_id: str
    supplier_name: str
    recommended_qty: int
    urgency: Literal["critical", "soon", "normal"]
    explanation: str
    metrics: CalculationMetrics


class CalculationResult(BaseModel):
    as_of: date
    recommendations: list[Recommendation]
