from functools import lru_cache
from secrets import token_urlsafe
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.Domains.Security.adapters.jwt import JwtTokenCodec
from app.Domains.Security.adapters.passwords import Argon2PasswordHasher
from app.Domains.Security.contracts import InvalidToken, SecurityUnavailable, TokenCodec
from app.Domains.Security.repositories.session_repository import SqlAlchemySessionRepository
from app.Domains.Security.services.security_service import SecurityService
from app.Domains.Users.dependencies import get_user_service
from app.Domains.Users.models.user import User
from app.Domains.Users.services.user_service import UserService

bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_password_hasher() -> Argon2PasswordHasher:
    return Argon2PasswordHasher()


@lru_cache
def get_dummy_password_hash() -> str:
    return get_password_hasher().hash(token_urlsafe(32))


def get_token_codec() -> TokenCodec:
    settings = get_settings()
    secret = settings.security_jwt_secret
    try:
        return JwtTokenCodec(secret.get_secret_value() if secret else "")
    except SecurityUnavailable as error:
        raise HTTPException(status_code=503, detail="Authentication is not configured") from error


def get_security_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
    users: Annotated[UserService, Depends(get_user_service)],
    tokens: Annotated[TokenCodec, Depends(get_token_codec)],
    hasher: Annotated[Argon2PasswordHasher, Depends(get_password_hasher)],
    dummy_hash: Annotated[str, Depends(get_dummy_password_hash)],
) -> SecurityService:
    return SecurityService(
        SqlAlchemySessionRepository(session),
        users,
        hasher,
        tokens,
        get_settings().security_token_ttl_seconds,
        dummy_hash,
    )


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid credentials or session",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> str:
    if credentials is None:
        raise unauthorized()
    return credentials.credentials


async def get_current_user(
    token: Annotated[str, Depends(get_bearer_token)],
    security: Annotated[SecurityService, Depends(get_security_service)],
    users: Annotated[UserService, Depends(get_user_service)],
) -> User:
    try:
        user_id = await security.authenticate(token)
    except InvalidToken as error:
        raise unauthorized() from error
    user = await users.get(user_id)
    if user is None:
        raise unauthorized()
    return user
