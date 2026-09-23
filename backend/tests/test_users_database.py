import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.Domains.Users.models import Permission, Role, User
from app.Domains.Users.repositories.user_repository import SqlAlchemyUserRepository

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 to use the Compose database",
)


@pytest.fixture
async def session():
    engine = create_async_engine(get_settings().database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            await session.begin()
            try:
                yield session
            finally:
                await session.rollback()
    finally:
        await engine.dispose()


async def test_user_repository_persists_and_eagerly_loads_effective_permissions(session):
    suffix = uuid4().hex
    read = Permission(code=f"read.{suffix}", name="Read")
    write = Permission(code=f"write.{suffix}", name="Write")
    personal = Permission(code=f"personal.{suffix}", name="Personal")
    reader = Role(code=f"reader.{suffix}", name="Reader", permissions=[read])
    editor = Role(code=f"editor.{suffix}", name="Editor", permissions=[read, write])
    user = User(first_name="Integration user", roles=[reader, editor], permissions=[read, personal])
    repository = SqlAlchemyUserRepository(session)
    transaction = session.get_transaction()

    assert await repository.add(user) is user
    assert transaction.is_active
    assert all(isinstance(entity.id, UUID) for entity in [user, reader, editor, read, write])
    user_id = user.id
    expected = {read.code, write.code, personal.code}
    session.expunge_all()

    restored = await repository.get(user_id)
    assert restored is not None
    assert restored is not user
    assert await repository.get(uuid4()) is None
    session.expunge_all()

    # Detached access proves all relationships needed by the synchronous method were loaded.
    assert restored.get_permissions() == expected
    assert restored.has_permission(write.code)
    assert not restored.has_permission(f"missing.{suffix}")


async def test_deleting_entities_cleans_links_and_preserves_shared_grants(session):
    suffix = uuid4().hex
    permission = Permission(code=f"shared.{suffix}", name="Shared")
    role = Role(code=f"shared.{suffix}", name="Shared", permissions=[permission])
    first = User(first_name="First", roles=[role], permissions=[permission])
    second = User(first_name="Second", roles=[role], permissions=[permission])
    repository = SqlAlchemyUserRepository(session)
    await repository.add(first)
    await repository.add(second)
    first_id, second_id, role_id, permission_id = first.id, second.id, role.id, permission.id
    permission_code = permission.code
    session.expunge_all()

    # Bulk deletes exercise database ON DELETE behavior without ORM link cleanup.
    await session.execute(delete(User).where(User.id == first_id))
    assert await repository.get(first_id) is None
    remaining = await repository.get(second_id)
    assert remaining.get_permissions() == {permission_code}
    assert await session.get(Role, role_id) is not None
    assert await session.get(Permission, permission_id) is not None

    await session.execute(delete(Role).where(Role.id == role_id))
    session.expunge_all()
    remaining = await repository.get(second_id)
    assert remaining.roles == []
    assert remaining.get_permissions() == {permission_code}

    await session.execute(delete(Permission).where(Permission.id == permission_id))
    session.expunge_all()
    remaining = await repository.get(second_id)
    assert remaining.get_permissions() == set()
    assert (
        await session.scalar(select(func.count()).select_from(User).where(User.id == second_id))
        == 1
    )


async def test_user_profile_and_credentials_persist(session):
    email = f"profile.{uuid4().hex}@example.com"
    repository = SqlAlchemyUserRepository(session)
    user = await repository.add(
        User(
            first_name="Иван",
            last_name="Иванов",
            middle_name="Иванович",
            phone="+77001234567",
            email=email,
            password_hash="stored-password-hash",
        )
    )
    user_id = user.id
    session.expunge_all()

    restored = await repository.get(user_id)
    assert restored.full_name == "Иванов Иван Иванович"
    assert restored.phone == "+77001234567"
    assert restored.email == email
    assert restored.password_hash == "stored-password-hash"
    assert await repository.get_credentials(email.upper()) == (user_id, "stored-password-hash")
    assert await repository.get_credentials(f"missing.{uuid4().hex}@example.com") is None

    passwordless = await repository.add(User(first_name="Legacy", email=f"legacy.{email}"))
    assert await repository.get_credentials(passwordless.email) is None


async def test_email_uniqueness_is_case_insensitive(session):
    email = f"unique.{uuid4().hex}@example.com"
    repository = SqlAlchemyUserRepository(session)
    await repository.add(User(first_name="First", email=email))

    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await repository.add(User(first_name="Second", email=email.upper()))

    # Legacy users without an email remain valid and do not conflict with each other.
    await repository.add(User(first_name="Legacy one"))
    await repository.add(User(first_name="Legacy two"))
