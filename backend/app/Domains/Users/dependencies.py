from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.Domains.Users.repositories.user_repository import SqlAlchemyUserRepository
from app.Domains.Users.services.user_service import UserService


def get_user_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
) -> UserService:
    return UserService(SqlAlchemyUserRepository(session))
