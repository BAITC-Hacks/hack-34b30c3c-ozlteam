from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.Domains.DataImports.DTO.rows import DataRow


class CreateSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    system: str = Field(default="1c", pattern=r"^(1c|file)$")


class ExchangeCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_key: str = Field(
        min_length=1, max_length=200, description="Ключ повтора одной поставки данных"
    )
    expected_revision: int = Field(ge=0, description="Текущая версия источника у получателя")
    cursor: str | None = Field(default=None, max_length=200)
    complete: bool = Field(description="Все части согласованной выгрузки получены; расчёт разрешён")
    rows: list[DataRow] = Field(min_length=1, max_length=10000)


class CatalogCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: UUID
    expected_revision: int = Field(ge=0)
    row: DataRow
