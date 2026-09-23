import asyncio
from typing import Protocol
from uuid import UUID

from app.Domains.Users.DTO.user import CreateUser
from app.Domains.Users.models import User
from app.Domains.Users.repositories.user_repository import UserRepository


class PasswordWriter(Protocol):
    def hash(self, password: str) -> str: ...


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    async def get_credentials(self, email: str) -> tuple[UUID, str] | None:
        return await self.repository.get_credentials(email.strip().lower())

    async def get(self, user_id: UUID) -> User | None:
        return await self.repository.get(user_id)

    async def create(self, data: CreateUser, passwords: PasswordWriter) -> User:
        password_hash = await asyncio.to_thread(passwords.hash, data.password.get_secret_value())
        return await self.repository.add(
            User(
                first_name=data.first_name,
                last_name=data.last_name,
                middle_name=data.middle_name,
                phone=data.phone,
                email=str(data.email),
                password_hash=password_hash,
            )
        )
