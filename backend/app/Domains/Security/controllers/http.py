from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.Domains.Security.contracts import InvalidCredentials, InvalidToken
from app.Domains.Security.dependencies import (
    get_bearer_token,
    get_current_user,
    get_security_service,
    unauthorized,
)
from app.Domains.Security.DTO.auth import Login
from app.Domains.Security.resources.auth import CurrentUserResource, TokenResource
from app.Domains.Security.services.security_service import SecurityService
from app.Domains.Users.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])
Service = Annotated[SecurityService, Depends(get_security_service)]


@router.post("/login", response_model=TokenResource)
async def login(data: Login, service: Service, response: Response):
    try:
        token = await service.login(data.email, data.password.get_secret_value())
    except InvalidCredentials as error:
        raise unauthorized() from error
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return TokenResource(access_token=token, expires_in=service.ttl_seconds)


@router.post("/logout", status_code=204)
async def logout(token: Annotated[str, Depends(get_bearer_token)], service: Service):
    try:
        await service.logout(token)
    except InvalidToken as error:
        raise unauthorized() from error
    return Response(status_code=204)


@router.get("/me", response_model=CurrentUserResource)
async def me(user: Annotated[User, Depends(get_current_user)], response: Response):
    response.headers["Cache-Control"] = "no-store"
    return CurrentUserResource(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        full_name=user.full_name,
        phone=user.phone,
        email=user.email,
        created_at=user.created_at,
        permissions=sorted(user.get_permissions()),
    )
