"""Permissions for the single-company, shared purchasing workspace."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException

from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import User


@lru_cache
def require_permission(code: str):
    async def permitted(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not user.has_permission(code):
            raise HTTPException(status_code=403, detail="Недостаточно прав для этой операции")
        return user

    return permitted
