from datetime import datetime
from typing import Protocol
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Security.models.session import AuthSession


class SessionRepository(Protocol):
    async def add(self, user_id: UUID, expires_at: datetime) -> AuthSession: ...

    async def get(self, session_id: UUID) -> AuthSession | None: ...

    async def delete(self, session_id: UUID) -> None: ...


class SqlAlchemySessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, user_id: UUID, expires_at: datetime) -> AuthSession:
        auth_session = AuthSession(user_id=user_id, expires_at=expires_at)
        self.session.add(auth_session)
        await self.session.flush()
        return auth_session

    async def get(self, session_id: UUID) -> AuthSession | None:
        return await self.session.get(AuthSession, session_id)

    async def delete(self, session_id: UUID) -> None:
        await self.session.execute(delete(AuthSession).where(AuthSession.id == session_id))
        await self.session.flush()
