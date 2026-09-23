from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SourceResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    system: str
    revision: int
    cursor: str | None
    complete: bool
    synced_at: datetime | None
    created_at: datetime


class ExchangeResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    batch_key: str
    revision: int
    row_count: int
    cursor: str | None
    created_at: datetime
    summary: dict[str, int]
