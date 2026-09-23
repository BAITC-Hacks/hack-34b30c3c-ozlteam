from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue

from app.Domains.Ai.DTO.conversation import AssistantId, ProposalKind


class Resource(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AssistantOut(BaseModel):
    id: AssistantId
    title: str
    description: str
    tools: list[str]


class SourceOut(BaseModel):
    title: str
    url: str


class ToolCallOut(BaseModel):
    name: str
    status: str
    summary: str


class MessageOut(Resource):
    id: UUID
    role: Literal["user", "assistant", "system"]
    content: str
    assistant_id: AssistantId
    created_at: datetime
    tool_calls: list[ToolCallOut]
    sources: list[SourceOut]


class ProposalOut(Resource):
    id: UUID
    kind: ProposalKind
    status: Literal["pending", "confirmed", "cancelled"]
    title: str
    summary: str
    payload: dict[str, JsonValue]
    preview: dict[str, JsonValue]
    version: int
    result: dict[str, JsonValue] | None
    created_at: datetime


class ConversationSummary(Resource):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationOut(ConversationSummary):
    messages: list[MessageOut]
    proposals: list[ProposalOut]
    has_older_messages: bool


class KnowledgeOut(BaseModel):
    id: str
    title: str
    url: str
    content: str
