from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.Domains.Ai.contracts import LlmRequestFailed, LlmUnavailable
from app.Domains.Ai.dependencies import get_llm_provider
from app.Domains.Ai.DTO.chat import AskAssistant
from app.Domains.Ai.resources.chat import AssistantAnswer
from app.Domains.Ai.services.assistant_service import AssistantService

router = APIRouter(prefix="/ai", tags=["Ai"])


def get_assistant() -> AssistantService:
    return AssistantService(get_llm_provider())


Service = Annotated[AssistantService, Depends(get_assistant)]


@router.post("/chat", response_model=AssistantAnswer)
async def ask(command: AskAssistant, service: Service):
    try:
        return AssistantAnswer(answer=await service.ask(command))
    except LlmUnavailable as error:
        # Ключа нет или провайдер не настроен: это конфигурация, а не сбой запроса.
        raise HTTPException(status_code=503, detail=str(error)) from error
    except LlmRequestFailed as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
