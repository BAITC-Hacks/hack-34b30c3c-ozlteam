from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES, ErrorResponse
from app.Domains.Ai.adapters.business_tools import BusinessTools
from app.Domains.Ai.dependencies import get_llm_provider
from app.Domains.Ai.DTO.conversation import CreateConversation, ProposalDecision, SendMessage
from app.Domains.Ai.repositories.conversation_repository import ConversationRepository
from app.Domains.Ai.resources.conversation import (
    AssistantOut,
    ConversationOut,
    ConversationSummary,
    KnowledgeOut,
    MessageOut,
)
from app.Domains.Ai.services.agent_engine import AgentEngine, assistant_catalog
from app.Domains.Ai.services.conversation_service import ConversationService
from app.Domains.Ai.services.knowledge_service import list_articles
from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import User

UserDependency = Annotated[User, Depends(get_current_user)]
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def no_cache(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/ai",
    tags=["Агент закупщика"],
    dependencies=[Depends(no_cache)],
    responses={
        **ERROR_RESPONSES,
        429: {"model": ErrorResponse, "description": "Лимит сообщений"},
        503: {"model": ErrorResponse, "description": "Модель недоступна"},
    },
)


def get_conversation_service(session: Session, user: UserDependency):
    tools = BusinessTools(session, user)
    return ConversationService(
        ConversationRepository(session),
        user.id,
        tools,
        lambda: AgentEngine(get_llm_provider(), tools),
    )


Service = Annotated[ConversationService, Depends(get_conversation_service)]


@router.get("/assistants", response_model=list[AssistantOut], summary="Главный агент и помощники")
async def assistants(user: UserDependency):
    return assistant_catalog()


@router.get("/knowledge", response_model=list[KnowledgeOut], summary="Редакционная справка системы")
async def knowledge(user: UserDependency):
    return list_articles()


@router.get("/conversations", response_model=list[ConversationSummary], summary="Мои диалоги")
async def conversations(
    service: Service, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)
):
    return await service.list(limit, offset)


@router.post(
    "/conversations",
    response_model=ConversationSummary,
    status_code=201,
    summary="Начать личный диалог",
)
async def create(command: CreateConversation, service: Service):
    return await service.create(command)


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationOut,
    summary="Диалог, последние 100 сообщений и предложения",
    description="Только владелец. Чужой ID возвращает 404. Старые сообщения — /messages.",
)
async def conversation(conversation_id: UUID, service: Service):
    return await service.get(conversation_id)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
    summary="Читать предыдущие сообщения",
    description="offset от новых сообщений; внутри страницы порядок хронологический.",
)
async def messages(
    conversation_id: UUID,
    service: Service,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await service.messages(conversation_id, limit, offset)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ConversationOut,
    summary="Спросить агента с разрешёнными инструментами",
    description="Повтор client_request_id идемпотентен. До 10 сообщений/минуту; "
    "один активный запрос пользователя. Модель ограничена 90 секундами. "
    "Изменения только предлагаются; учётные сводки требуют allow_business_data. "
    "При недоступности модели возвращается 503, сообщение не сохраняется.",
)
async def send(conversation_id: UUID, command: SendMessage, service: Service):
    return await service.send(conversation_id, command)


@router.post(
    "/conversations/{conversation_id}/proposals/{proposal_id}/decision",
    response_model=ConversationOut,
    summary="Подтвердить или отменить предложение агента",
    description="Проверка владельца, версии, актуальности и предметных прав. "
    "Повтор того же решения безопасен. Не утверждает и не отправляет заказ поставщику.",
)
async def decide(
    conversation_id: UUID, proposal_id: UUID, command: ProposalDecision, service: Service
):
    return await service.decide(conversation_id, proposal_id, command)
