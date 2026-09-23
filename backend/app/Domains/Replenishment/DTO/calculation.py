from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
