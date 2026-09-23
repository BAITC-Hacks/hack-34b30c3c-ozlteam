from asyncio import to_thread
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.Domains.Security.contracts import (
    InvalidCredentials,
    InvalidToken,
    PasswordHasher,
    TokenCodec,
    UserCredentials,
)
from app.Domains.Security.repositories.session_repository import SessionRepository


class SecurityService:
    def __init__(
        self,
        repository: SessionRepository,
        users: UserCredentials,
        hasher: PasswordHasher,
        tokens: TokenCodec,
        ttl_seconds: int,
        dummy_password_hash: str,
    ):
        self.repository = repository
        self.users = users
        self.hasher = hasher
        self.tokens = tokens
        self.ttl_seconds = ttl_seconds
        self.dummy_password_hash = dummy_password_hash

    async def login(self, email: str, password: str) -> str:
        credentials = await self.users.get_credentials(email)
        password_hash = credentials[1] if credentials else self.dummy_password_hash
        # Argon2 is CPU/memory intensive; do not block the async request loop.
        valid = await to_thread(self.hasher.verify, password_hash, password)
        if not valid or credentials is None:
            raise InvalidCredentials
        expires_at = datetime.now(UTC) + timedelta(seconds=self.ttl_seconds)
        session = await self.repository.add(credentials[0], expires_at)
        return self.tokens.encode(session.id, expires_at)

    async def authenticate(self, token: str) -> UUID:
        session_id = self.tokens.decode(token)
        session = await self.repository.get(session_id)
        if session is None or session.expires_at <= datetime.now(UTC):
            raise InvalidToken
        return session.user_id

    async def logout(self, token: str) -> None:
        await self.authenticate(token)
        await self.repository.delete(self.tokens.decode(token))
