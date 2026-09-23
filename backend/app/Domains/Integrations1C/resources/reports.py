from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.Domains.Integrations1C.DTO.reports import SaveReport


class ReportResource(SaveReport):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    created_at: datetime
    updated_at: datetime


class ReportField(BaseModel):
    name: str
    label: str
    required: bool
    type: str


class ReportKindResource(BaseModel):
    kind: str
    title: str
    description: str
    fields: list[ReportField]
