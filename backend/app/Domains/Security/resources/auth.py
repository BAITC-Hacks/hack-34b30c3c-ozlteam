from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class TokenResource(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class CurrentUserResource(BaseModel):
    id: UUID
    first_name: str
    last_name: str | None
    middle_name: str | None
    full_name: str
    phone: str | None
    email: str | None
    created_at: datetime
    permissions: list[str]
