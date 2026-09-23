import os
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_session
from app.Domains.Security.adapters.jwt import JwtTokenCodec
from app.Domains.Security.adapters.passwords import Argon2PasswordHasher
from app.Domains.Security.dependencies import get_token_codec
from app.Domains.Security.models.session import AuthSession
from app.Domains.Users.DTO.user import CreateUser
from app.Domains.Users.models import Permission, Role, User
from app.Domains.Users.repositories.user_repository import SqlAlchemyUserRepository
from app.Domains.Users.services.user_service import UserService
from app.main import app

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 to use the Compose database",
)


async def test_auth_database_lifecycle_and_user_delete_cascade():
    engine = create_async_engine(get_settings().database_url)
    codec = JwtTokenCodec("integration-test-signing-secret-at-least-32-bytes")
    suffix = uuid4().hex
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            sessions = async_sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )

            async def session_dependency():
                async with sessions() as session, session.begin():
                    yield session

            app.dependency_overrides[get_session] = session_dependency
            app.dependency_overrides[get_token_codec] = lambda: codec
            try:
                async with sessions() as session, session.begin():
                    user = await UserService(SqlAlchemyUserRepository(session)).create(
                        CreateUser(
                            first_name="Иван",
                            last_name="Иванов",
                            email=f"auth.{suffix}@example.com",
                            password="a-secure-test-password",
                        ),
                        Argon2PasswordHasher(),
                    )
                    permission = Permission(code=f"auth.read.{suffix}", name="Read")
                    role = Role(code=f"auth.role.{suffix}", name="Reader", permissions=[permission])
                    # Assign the same permission directly and through a role.
                    user_id = user.id
                    session.add(role)
                    await session.flush()
                    from app.Domains.Users.models.user import user_permissions, user_roles

                    await session.execute(
                        user_roles.insert().values(user_id=user_id, role_id=role.id)
                    )
                    await session.execute(
                        user_permissions.insert().values(
                            user_id=user_id, permission_id=permission.id
                        )
                    )
                    permission_code = permission.code

                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    credentials = {
                        "email": f"auth.{suffix}@example.com",
                        "password": "a-secure-test-password",
                    }
                    response = await client.post("/api/v1/auth/login", json=credentials)
                    assert response.status_code == 200, response.text
                    token = response.json()["access_token"]
                    session_id = codec.decode(token)
                    assert isinstance(session_id, UUID)
                    async with sessions() as session:
                        stored = await session.get(AuthSession, session_id)
                        assert stored.user_id == user_id

                    headers = {"Authorization": f"Bearer {token}"}
                    response = await client.get("/api/v1/auth/me", headers=headers)
                    assert response.status_code == 200, response.text
                    assert response.json()["permissions"] == [permission_code]
                    assert "password_hash" not in response.json()
                    async with sessions() as session, session.begin():
                        await session.execute(
                            delete(user_permissions).where(user_permissions.c.user_id == user_id)
                        )
                        await session.execute(
                            delete(user_roles).where(user_roles.c.user_id == user_id)
                        )
                    refreshed = await client.get("/api/v1/auth/me", headers=headers)
                    assert refreshed.json()["permissions"] == []
                    assert (
                        await client.post("/api/v1/auth/logout", headers=headers)
                    ).status_code == 204
                    async with sessions() as session:
                        assert await session.get(AuthSession, session_id) is None
                    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401

                    second = await client.post("/api/v1/auth/login", json=credentials)
                    second_token = second.json()["access_token"]
                    async with sessions() as session, session.begin():
                        await session.execute(delete(User).where(User.id == user_id))
                    async with sessions() as session:
                        assert (
                            await session.scalar(
                                select(AuthSession).where(AuthSession.user_id == user_id)
                            )
                            is None
                        )
                    assert (
                        await client.get(
                            "/api/v1/auth/me", headers={"Authorization": f"Bearer {second_token}"}
                        )
                    ).status_code == 401
            finally:
                app.dependency_overrides.clear()
                await transaction.rollback()
    finally:
        await engine.dispose()
