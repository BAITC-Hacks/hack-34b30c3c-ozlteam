from typing import Protocol
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.Domains.Users.models import Role, User


class UserRepository(Protocol):
    async def get(self, user_id: UUID) -> User | None: ...
    async def add(self, user: User) -> User: ...
    async def get_credentials(self, email: str) -> tuple[UUID, str] | None: ...


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_credentials(self, email: str) -> tuple[UUID, str] | None:
        row = (
            await self.session.execute(
                select(User.id, User.password_hash).where(func.lower(User.email) == email.lower())
            )
        ).one_or_none()
        if row is None or row.password_hash is None:
            return None
        return row.id, row.password_hash

    async def get(self, user_id: UUID) -> User | None:
        return await self.session.scalar(
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.permissions),
                selectinload(User.roles).selectinload(Role.permissions),
            )
        )

    async def add(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        # Also initialize omitted empty collections for use outside the session.
        loaded_user = await self.get(user.id)
        assert loaded_user is not None
        return loaded_user
