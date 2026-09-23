from datetime import datetime
from typing import Protocol
from uuid import UUID


class InvalidToken(Exception):
    pass


class InvalidCredentials(Exception):
    pass


class SecurityUnavailable(Exception):
    pass


class TokenCodec(Protocol):
    def encode(self, session_id: UUID, expires_at: datetime) -> str: ...

    def decode(self, token: str) -> UUID: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password_hash: str, password: str) -> bool: ...


class UserCredentials(Protocol):
    async def get_credentials(self, email: str) -> tuple[UUID, str] | None: ...
