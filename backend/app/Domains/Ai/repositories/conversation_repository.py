from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Ai.models.conversation import AgentMessage, AgentProposal, Conversation


class ConversationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def try_user_lock(self, owner_id: UUID) -> bool:
        # Serialize AI mutations per user across workers, without holding other users up.
        key = int.from_bytes(sha256(f"ai:{owner_id}".encode()).digest()[:8], signed=True)
        return bool(await self.session.scalar(select(func.pg_try_advisory_xact_lock(key))))

    async def recent_requests(self, owner_id: UUID) -> int:
        return (
            await self.session.scalar(
                select(func.count(AgentMessage.id))
                .join(Conversation, Conversation.id == AgentMessage.conversation_id)
                .where(
                    Conversation.owner_id == owner_id,
                    AgentMessage.role == "user",
                    AgentMessage.created_at >= datetime.now(UTC) - timedelta(minutes=1),
                )
            )
            or 0
        )

    async def list(self, owner_id: UUID, limit: int, offset: int):
        return list(
            await self.session.scalars(
                select(Conversation)
                .where(Conversation.owner_id == owner_id)
                .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )

    async def create(self, owner_id: UUID, title: str):
        conversation = Conversation(owner_id=owner_id, title=title)
        self.session.add(conversation)
        await self.session.flush()
        return conversation

    async def get(self, owner_id: UUID, conversation_id: UUID):
        return await self.session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.owner_id == owner_id
            )
        )

    async def messages(self, conversation_id: UUID, limit: int, offset: int = 0):
        newest = list(
            await self.session.scalars(
                select(AgentMessage)
                .where(AgentMessage.conversation_id == conversation_id)
                .order_by(AgentMessage.created_at.desc(), AgentMessage.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        return list(reversed(newest))

    async def request(self, conversation_id: UUID, request_id: UUID):
        return await self.session.scalar(
            select(AgentMessage).where(
                AgentMessage.conversation_id == conversation_id,
                AgentMessage.client_request_id == request_id,
            )
        )

    async def add_message(self, conversation_id: UUID, **values):
        message = AgentMessage(conversation_id=conversation_id, **values)
        self.session.add(message)
        await self.session.flush()
        return message

    async def proposals(self, conversation_id: UUID):
        return list(
            await self.session.scalars(
                select(AgentProposal)
                .where(AgentProposal.conversation_id == conversation_id)
                .order_by(AgentProposal.created_at, AgentProposal.id)
            )
        )

    async def proposal(self, conversation_id: UUID, proposal_id: UUID):
        return await self.session.scalar(
            select(AgentProposal)
            .where(
                AgentProposal.conversation_id == conversation_id, AgentProposal.id == proposal_id
            )
            .with_for_update()
        )

    async def add_proposal(self, conversation_id: UUID, values: dict):
        proposal = AgentProposal(conversation_id=conversation_id, **values)
        self.session.add(proposal)
        await self.session.flush()
        return proposal

    async def touch(self, conversation: Conversation):
        conversation.updated_at = datetime.now(UTC)
        await self.session.flush()

    async def limit_llm_transaction(self):
        # Bound each SQL statement; ConversationService separately limits the model wait.
        await self.session.execute(text("SET LOCAL statement_timeout = '10s'"))
