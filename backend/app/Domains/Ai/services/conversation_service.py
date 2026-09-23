import asyncio
import hashlib
import json
from uuid import UUID

from app.core.errors import DomainError
from app.Domains.Ai.contracts import LlmRequestFailed, LlmUnavailable
from app.Domains.Ai.DTO.conversation import CreateConversation, ProposalDecision, SendMessage
from app.Domains.Ai.repositories.conversation_repository import ConversationRepository
from app.Domains.Ai.resources.conversation import ConversationOut, MessageOut, ProposalOut
from app.Domains.Ai.services.test_order_context import test_order_offer


class ConversationService:
    def __init__(self, repository: ConversationRepository, owner_id: UUID, tools, engine_factory):
        self.repository = repository
        self.owner_id = owner_id
        self.tools = tools
        self.engine_factory = engine_factory

    async def create(self, command: CreateConversation):
        return await self.repository.create(self.owner_id, command.title)

    async def list(self, limit: int, offset: int):
        return await self.repository.list(self.owner_id, limit, offset)

    async def require(self, conversation_id: UUID):
        conversation = await self.repository.get(self.owner_id, conversation_id)
        if conversation is None:
            raise DomainError("Диалог не найден", 404, "conversation_not_found")
        return conversation

    async def get(self, conversation_id: UUID):
        conversation = await self.require(conversation_id)
        messages = await self.repository.messages(conversation_id, 101)
        return ConversationOut(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=[MessageOut.model_validate(row) for row in messages[-100:]],
            proposals=[
                ProposalOut.model_validate(row)
                for row in await self.repository.proposals(conversation_id)
            ],
            has_older_messages=len(messages) > 100,
        )

    async def messages(self, conversation_id: UUID, limit: int, offset: int):
        await self.require(conversation_id)
        return await self.repository.messages(conversation_id, limit, offset)

    async def _lock(self):
        if not await self.repository.try_user_lock(self.owner_id):
            raise DomainError(
                "Предыдущее действие ещё выполняется. Повторите после ответа.",
                409,
                "assistant_busy",
            )

    async def send(self, conversation_id: UUID, command: SendMessage):
        conversation = await self.require(conversation_id)
        await self._lock()
        fingerprint = hashlib.sha256(command.model_dump_json().encode()).hexdigest()
        previous = await self.repository.request(conversation_id, command.client_request_id)
        if previous:
            if previous.request_hash != fingerprint:
                raise DomainError(
                    "Ключ сообщения уже использован для другого запроса",
                    409,
                    "message_key_conflict",
                )
            return await self.get(conversation_id)
        if await self.repository.recent_requests(self.owner_id) >= 10:
            raise DomainError(
                "Не более 10 сообщений в минуту. Попробуйте позже.", 429, "assistant_rate_limit"
            )
        history = await self.repository.messages(conversation_id, 20)
        # Keep the user's own selections for a multi-turn order, only with current consent
        # and catalog permission. Business replies/tool facts are always fetched anew.
        preserve_user_intent = command.allow_business_data and self.tools.can_use_supplier_context()
        turns = []
        for m in history:
            if m.role not in {"user", "assistant"}:
                continue
            if not m.business_context or (m.role == "user" and preserve_user_intent):
                turns.append({"role": m.role, "content": m.content[:4000]})
            elif m.role == "assistant" and preserve_user_intent:
                offer = test_order_offer(m.content)
                if offer:
                    turns.append({"role": "assistant", "content": offer})
        await self.repository.limit_llm_transaction()
        try:
            async with asyncio.timeout(90):
                result = await self.engine_factory().run(
                    command.content,
                    turns,
                    assistant_id=command.assistant_id,
                    context=command.context.model_dump(mode="json", exclude_none=True),
                    allow_business_data=command.allow_business_data,
                )
        except (LlmUnavailable, LlmRequestFailed, TimeoutError) as error:
            # Do not send provider bodies, secrets or exception strings to the client.
            raise DomainError(
                "Модель временно недоступна. Повторите сообщение позже.",
                503,
                "assistant_unavailable",
            ) from error
        await self.repository.add_message(
            conversation_id,
            role="user",
            content=command.content,
            assistant_id=command.assistant_id,
            client_request_id=command.client_request_id,
            request_hash=fingerprint,
            tool_calls=[],
            sources=[],
            business_context=command.allow_business_data,
        )
        await self.repository.add_message(
            conversation_id,
            role="assistant",
            content=result["content"],
            assistant_id=result["assistant_id"],
            tool_calls=result.get("tool_calls", []),
            sources=result.get("sources", []),
            business_context=command.allow_business_data,
        )
        if result.get("proposal"):
            if not command.allow_business_data:
                raise DomainError(
                    "Разрешение на работу с учётными данными не предоставлено",
                    403,
                    "business_data_not_allowed",
                )
            requested = result["proposal"]
            # Only the adapter constructs authoritative preview/labels/payload, not model text.
            proposal = await self.tools.prepare(requested["kind"], requested["payload"])
            await self.repository.add_proposal(conversation_id, proposal)
        if conversation.title == "Новый диалог":
            conversation.title = command.content[:160]
        await self.repository.touch(conversation)
        return await self.get(conversation_id)

    async def decide(self, conversation_id: UUID, proposal_id: UUID, command: ProposalDecision):
        conversation = await self.require(conversation_id)
        await self._lock()
        proposal = await self.repository.proposal(conversation_id, proposal_id)
        if proposal is None:
            raise DomainError("Предложение не найдено", 404, "proposal_not_found")
        target = "confirmed" if command.decision == "confirm" else "cancelled"
        if proposal.status != "pending":
            # Lost response retry: replay only the same original decision/version.
            if proposal.status == target and command.expected_version == proposal.version - 1:
                return await self.get(conversation_id)
            raise DomainError("Решение по предложению уже принято", 409, "proposal_resolved")
        if command.expected_version != proposal.version:
            raise DomainError(
                "Предложение изменилось. Откройте актуальную версию.",
                409,
                "proposal_version_conflict",
            )
        if target == "confirmed":
            fresh = await self.tools.prepare(proposal.kind, proposal.payload)
            if json.dumps(fresh["preview"], sort_keys=True) != json.dumps(
                proposal.preview, sort_keys=True
            ):
                raise DomainError(
                    "Данные изменились. Запросите новое предложение и проверьте его.",
                    409,
                    "proposal_stale",
                )
            proposal.result = await self.tools.confirm(
                proposal.kind, proposal.payload, f"ai-proposal:{proposal.id}"
            )
            content = (
                "Подтверждение принято. Результат или статус фоновой задачи "
                "— в карточке предложения."
            )
        else:
            content = "Предложение отменено. Учётные данные и заказы не изменены."
        proposal.status = target
        proposal.version += 1
        await self.repository.add_message(
            conversation_id,
            role="system",
            assistant_id="auto",
            content=content,
            tool_calls=[{"name": proposal.kind, "status": target, "summary": proposal.title}],
            sources=[],
            business_context=True,
        )
        await self.repository.touch(conversation)
        return await self.get(conversation_id)
