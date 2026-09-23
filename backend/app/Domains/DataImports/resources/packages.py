from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.Domains.DataImports.DTO.packages import PackageOptions


class PackageFile(BaseModel):
    name: str
    size: int
    sha256: str
    profile: str | None = None
    row_count: int | None = None


class PackageResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    name: str
    status: Literal["queued", "parsing", "validated", "applying", "applied", "failed"]
    job_id: UUID | None
    files: list[PackageFile]
    options: PackageOptions
    summary: dict[str, JsonValue]
    controls: JsonValue = Field(
        description="Число контрольных записей по виду; исходные ячейки хранятся отдельно"
    )
    row_count: int
    processed_rows: int
    issue_count: int
    error: str | None
    created_at: datetime
    applied_at: datetime | None


class PackagePage(BaseModel):
    items: list[PackageResource]
    total: int
    limit: int
    offset: int


class PackageItems(BaseModel):
    items: list[dict[str, JsonValue]]
    total: int
    limit: int
    offset: int
