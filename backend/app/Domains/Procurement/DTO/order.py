from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateOrders(Command):
    recommendation_ids: list[UUID] = Field(min_length=1, max_length=1000)
    idempotency_key: str = Field(min_length=1, max_length=128, examples=["warehouse-2026-09-23-01"])

    @model_validator(mode="after")
    def unique_ids(self):
        if len(self.recommendation_ids) != len(set(self.recommendation_ids)):
            raise ValueError("recommendation_ids must be unique")
        return self


class VersionCommand(Command):
    expected_version: int = Field(ge=1, description="Версия из последнего GET заказа.")


class EditOrder(VersionCommand):
    comment: str = Field(max_length=4000)
    reason: str = Field(min_length=1, max_length=4000)


class EditLine(VersionCommand):
    quantity: Decimal = Field(gt=0, max_digits=20, decimal_places=6, examples=["125.500000"])
    reason: str = Field(min_length=1, max_length=4000)


class DeleteLine(VersionCommand):
    reason: str = Field(min_length=1, max_length=4000)


class ReviseOrder(VersionCommand):
    reason: str = Field(min_length=1, max_length=4000)


class Acknowledge(Command):
    revision: int = Field(ge=1)
    status: Literal["accepted", "rejected"]
    external_document_id: str | None = Field(default=None, min_length=1, max_length=200)
    message: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def require_reference(self):
        if self.status == "accepted" and not self.external_document_id:
            raise ValueError("external_document_id is required for accepted acknowledgement")
        return self
