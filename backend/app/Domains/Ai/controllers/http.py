from uuid import uuid4

from fastapi import APIRouter, Depends

from app.core.errors import ERROR_RESPONSES, ErrorResponse
from app.Domains.Ai.controllers.conversations import Service, no_cache
from app.Domains.Ai.DTO.chat import AskAssistant
from app.Domains.Ai.DTO.conversation import CreateConversation, SendMessage
from app.Domains.Ai.resources.chat import AssistantAnswer

router = APIRouter(
    prefix="/ai",
    tags=["Ai"],
    dependencies=[Depends(no_cache)],
    responses={**ERROR_RESPONSES, 429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)


@router.post(
    "/chat",
    response_model=AssistantAnswer,
    deprecated=True,
    summary="Совместимость: один справочный вопрос",
    description="Требует входа, сохраняет новый личный диалог. Используйте /ai/conversations "
    "для продолжения истории. Переданная клиентом history больше не используется.",
)
async def ask(command: AskAssistant, service: Service):
    conversation = await service.create(CreateConversation())
    result = await service.send(
        conversation.id,
        SendMessage(content=command.question, client_request_id=uuid4(), assistant_id="help"),
    )
    return AssistantAnswer(answer=result.messages[-1].content)
