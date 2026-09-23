from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.Domains.Ai.DTO.agent_tools import AssistantId, ProposalKind  # noqa: F401


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateConversation(Command):
    title: str = Field(default="Новый диалог", min_length=1, max_length=160)


class AgentContext(Command):
    warehouse_id: UUID | None = None
    run_id: UUID | None = None
    recommendation_id: UUID | None = None
    order_id: UUID | None = None
    package_id: UUID | None = None


class SendMessage(Command):
    content: str = Field(min_length=1, max_length=4000)
    client_request_id: UUID = Field(description="Один ключ для повторов того же сообщения")
    assistant_id: AssistantId = "auto"
    context: AgentContext = Field(default_factory=AgentContext)
    allow_business_data: bool = Field(
        default=False,
        description="Явное разрешение передать модели ограниченные учётные сводки. Не сырые файлы.",
    )


class ProposalDecision(Command):
    expected_version: int = Field(ge=1)
    decision: Literal["confirm", "cancel"]
