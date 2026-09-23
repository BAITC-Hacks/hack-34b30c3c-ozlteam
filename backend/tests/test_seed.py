import os
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.Domains.Notes.models.note import Note
from app.Domains.Users.models import Permission, Role, User
from app.Domains.Users.repositories.user_repository import SqlAlchemyUserRepository
from app.seed import mock, seed


def test_roles_reference_declared_permissions_only():
    for code, (_, permissions) in seed.ROLES.items():
        unknown = sorted(set(permissions) - seed.PERMISSIONS.keys())
        assert unknown == [], f"роль {code} ссылается на несуществующие права"
        assert len(permissions) == len(set(permissions)), f"роль {code} содержит повторы"


def test_permission_codes_follow_domain_action_convention():
    for code in seed.PERMISSIONS:
        domain, _, action = code.partition(".")
        assert domain and action and "." not in action, code


def test_role_catalogue_matches_contract():
    assert set(seed.ROLES) == {"admin", "manager", "dispatcher", "viewer"}
    assert set(seed.ROLES["admin"][1]) == set(seed.PERMISSIONS)
    assert set(seed.ROLES["viewer"][1]) == set(seed.READ_PERMISSIONS)
    assert set(seed.ROLES["manager"][1]) == set(seed.READ_PERMISSIONS) | {
        "files.write",
        "jobs.write",
    }
    assert set(seed.ROLES["dispatcher"][1]) == {"files.read", "files.write", "jobs.read"}


def test_permission_catalogue_matches_contract():
    assert set(seed.PERMISSIONS) == {
        "notes.read",
        "notes.write",
        "files.read",
        "files.write",
        "jobs.read",
        "jobs.write",
        "users.read",
        "users.write",
        "roles.manage",
    }


def test_mock_data_references_seeded_catalogue_and_is_unique():
    assert len(mock.MOCK_USERS) == 3
    assert len(mock.MOCK_EMAILS) == len(set(mock.MOCK_EMAILS))
    assert len(mock.MOCK_NOTES) == len(set(mock.MOCK_NOTES))
    for user in mock.MOCK_USERS:
        assert user.email == user.email.lower()
        assert user.role in seed.ROLES
        assert set(user.permissions) <= seed.PERMISSIONS.keys()
    for title in mock.MOCK_NOTES:
        assert 0 < len(title) <= 200


def test_password_and_email_come_from_environment(monkeypatch):
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_ADMIN_EMAIL", raising=False)
    assert seed.resolve_password("SEED_ADMIN_PASSWORD") == (seed.DEFAULT_PASSWORD, True)
    assert seed.resolve_admin_email() == seed.DEFAULT_ADMIN_EMAIL

    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "configured-secret")
    monkeypatch.setenv("SEED_ADMIN_EMAIL", "  Root@Example.COM ")
    assert seed.resolve_password("SEED_ADMIN_PASSWORD") == ("configured-secret", False)
    assert seed.resolve_admin_email() == "root@example.com"


database = pytest.mark.skipif(
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
                # Скрипты меняют общую базу; тест не оставляет следов.
                await session.rollback()
    finally:
        await engine.dispose()


async def count_rows(session, model, column, values) -> int:
    return await session.scalar(
        select(func.count()).select_from(model).where(column.in_(tuple(values)))
    )


async def code_counts(session, model, codes) -> dict[str, int]:
    rows = await session.execute(
        select(model.code, func.count()).where(model.code.in_(tuple(codes))).group_by(model.code)
    )
    return dict(rows.all())


@database
async def test_seed_is_idempotent_and_grants_admin_every_permission(session, monkeypatch):
    email = f"admin.{uuid4().hex}@example.com"
    monkeypatch.setenv("SEED_ADMIN_EMAIL", email)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)

    await seed.apply(session)
    after_first = (
        await code_counts(session, Permission, seed.PERMISSIONS),
        await code_counts(session, Role, seed.ROLES),
        await count_rows(session, User, func.lower(User.email), [email]),
    )
    await seed.apply(session)
    after_second = (
        await code_counts(session, Permission, seed.PERMISSIONS),
        await code_counts(session, Role, seed.ROLES),
        await count_rows(session, User, func.lower(User.email), [email]),
    )

    assert after_first == after_second
    assert after_first[0] == dict.fromkeys(seed.PERMISSIONS, 1)
    assert after_first[1] == dict.fromkeys(seed.ROLES, 1)
    assert after_first[2] == 1

    admin = await seed.find_user(session, email)
    assert admin is not None
    assert admin.password_hash and seed.DEFAULT_PASSWORD not in admin.password_hash
    loaded = await SqlAlchemyUserRepository(session).get(admin.id)
    assert loaded.get_permissions() == set(seed.PERMISSIONS)


@database
async def test_mock_is_idempotent_and_reset_removes_only_mock_data(session, monkeypatch):
    monkeypatch.setenv("SEED_ADMIN_EMAIL", f"admin.{uuid4().hex}@example.com")
    monkeypatch.delenv("SEED_MOCK_PASSWORD", raising=False)
    await seed.apply(session)

    await mock.apply(session)
    await mock.apply(session)

    assert await count_rows(session, User, func.lower(User.email), mock.MOCK_EMAILS) == len(
        mock.MOCK_EMAILS
    )
    assert await count_rows(session, Note, Note.title, mock.MOCK_NOTES) == len(mock.MOCK_NOTES)

    repository = SqlAlchemyUserRepository(session)
    for declared in mock.MOCK_USERS:
        user = await seed.find_user(session, declared.email)
        assert user is not None
        assert user.full_name.startswith(declared.last_name)
        assert {role.code for role in user.roles} == {declared.role}
        expected = set(seed.ROLES[declared.role][1]) | set(declared.permissions)
        loaded = await repository.get(user.id)
        assert loaded.get_permissions() == expected

    await mock.reset(session)

    assert await count_rows(session, User, func.lower(User.email), mock.MOCK_EMAILS) == 0
    assert await count_rows(session, Note, Note.title, mock.MOCK_NOTES) == 0
    assert await code_counts(session, Permission, seed.PERMISSIONS) == dict.fromkeys(
        seed.PERMISSIONS, 1
    )
    assert await code_counts(session, Role, seed.ROLES) == dict.fromkeys(seed.ROLES, 1)
    assert await seed.find_user(session, seed.resolve_admin_email()) is not None
