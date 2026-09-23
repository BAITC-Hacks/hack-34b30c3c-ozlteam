from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.Domains.DataImports.DTO.rows import DataRow


class RowError(BaseModel):
    sheet: str | None
    row: int
    column: str | None
    message: str


class ImportResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    filename: str
    kind: str
    base_revision: int
    status: str
    row_count: int
    errors: list[RowError]
    created_at: datetime
    applied_at: datetime | None


class ImportDetail(ImportResource):
    preview: list[DataRow]


class MappingResource(BaseModel):
    columns: dict[str, str]
