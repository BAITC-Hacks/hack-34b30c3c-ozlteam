"""Базовые справочники: права, роли и учётная запись администратора.

Запуск: `python -m app.seed.seed`. Идемпотентно: повторный запуск ничего не дублирует.
"""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.Domains.Security.adapters.passwords import Argon2PasswordHasher
from app.Domains.Users.models import Permission, Role, User
from app.seed.runner import created, done, run, section, session_scope, skipped, updated, warning

# Права по конвенции <домен>.<действие>.
PERMISSIONS: dict[str, str] = {
    "notes.read": "Чтение заметок",
    "notes.write": "Создание и изменение заметок",
    "files.read": "Просмотр файлов",
    "files.write": "Загрузка и удаление файлов",
    "jobs.read": "Просмотр фоновых задач",
    "jobs.write": "Запуск фоновых задач",
    "users.read": "Просмотр пользователей",
    "users.write": "Создание и изменение пользователей",
    "roles.manage": "Управление ролями и правами",
    "catalogs.read": "Просмотр справочников",
    "catalogs.write": "Изменение справочников",
    "inventory.read": "Просмотр запасов и продаж",
    "imports.read": "Просмотр загрузок",
    "imports.write": "Проверка и применение загрузок",
    "integrations.read": "Просмотр обмена с 1С",
    "integrations.write": "Обмен данными с 1С",
    "replenishment.read": "Просмотр рекомендаций",
    "replenishment.run": "Расчёт пополнения",
    "orders.read": "Просмотр заказов поставщикам",
    "orders.write": "Подготовка заказов поставщикам",
    "orders.approve": "Утверждение заказов поставщикам",
    "orders.export": "Экспорт заказов поставщикам",
}

READ_PERMISSIONS: tuple[str, ...] = tuple(code for code in PERMISSIONS if code.endswith(".read"))

# Роль -> отображаемое имя и набор кодов прав.
ROLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "admin": ("Администратор", tuple(PERMISSIONS)),
    "manager": ("Руководитель направления", (*READ_PERMISSIONS, "files.write", "jobs.write")),
    "dispatcher": ("Диспетчер", ("files.read", "files.write", "jobs.read")),
    "viewer": ("Наблюдатель", READ_PERMISSIONS),
    "purchaser": (
        "Менеджер закупок",
        (
            *READ_PERMISSIONS,
            "files.write",
            "jobs.write",
            "imports.write",
            "catalogs.write",
            "replenishment.run",
            "orders.write",
            "orders.approve",
            "orders.export",
        ),
    ),
    "integration": (
        "Обмен с 1С",
        ("integrations.read", "integrations.write", "orders.read", "orders.export"),
    ),
}

ADMIN_ROLE = "admin"
DEFAULT_ADMIN_EMAIL = "admin@hackalem.local"
# Единственный пароль в коде: значение по умолчанию для локальной разработки.
DEFAULT_PASSWORD = "admin12345"
LOCAL_ONLY_WARNING = (
    "Пароль по умолчанию используется только для локальной разработки. "
    "Для общего стенда задайте SEED_ADMIN_PASSWORD и SEED_MOCK_PASSWORD."
)


def resolve_password(variable: str) -> tuple[str, bool]:
    """Пароль из переменной окружения и признак того, что взят пароль по умолчанию."""
    value = os.getenv(variable)
    if value:
        return value, False
    return DEFAULT_PASSWORD, True


def resolve_admin_email() -> str:
    return (os.getenv("SEED_ADMIN_EMAIL") or DEFAULT_ADMIN_EMAIL).strip().lower()


async def ensure_permissions(session: AsyncSession) -> dict[str, Permission]:
    """Создать недостающие права; естественный ключ — code."""
    found = {
        permission.code: permission
        for permission in await session.scalars(
            select(Permission).where(Permission.code.in_(PERMISSIONS))
        )
    }
    permissions: dict[str, Permission] = {}
    for code, name in PERMISSIONS.items():
        permission = found.get(code)
        if permission is None:
            permission = Permission(code=code, name=name)
            session.add(permission)
            created(f"право {code}")
        else:
            skipped(f"право {code}")
        permissions[code] = permission
    await session.flush()
    return permissions


async def ensure_roles(
    session: AsyncSession, permissions: dict[str, Permission]
) -> dict[str, Role]:
    """Создать недостающие роли и дополнить существующие отсутствующими правами."""
    found = {
        role.code: role
        for role in await session.scalars(
            select(Role).where(Role.code.in_(ROLES)).options(selectinload(Role.permissions))
        )
    }
    roles: dict[str, Role] = {}
    for code, (name, codes) in ROLES.items():
        role = found.get(code)
        if role is None:
            role = Role(code=code, name=name, permissions=[permissions[item] for item in codes])
            session.add(role)
            created(f"роль {code} ({len(codes)} прав)")
        else:
            granted = {permission.code for permission in role.permissions}
            missing = [item for item in codes if item not in granted]
            if missing:
                role.permissions.extend(permissions[item] for item in missing)
                updated(f"роль {code}: добавлены права {', '.join(missing)}")
            else:
                skipped(f"роль {code}")
        roles[code] = role
    await session.flush()
    return roles


async def find_user(session: AsyncSession, email: str) -> User | None:
    """Пользователь по естественному ключу — почте без учёта регистра."""
    return await session.scalar(
        select(User)
        .where(func.lower(User.email) == email.lower())
        .options(selectinload(User.roles), selectinload(User.permissions))
    )


async def hash_password(password: str) -> str:
    """Argon2 через существующий адаптер проекта, вне event loop."""
    return await asyncio.to_thread(Argon2PasswordHasher().hash, password)


async def ensure_admin(session: AsyncSession, roles: dict[str, Role]) -> User:
    """Создать администратора или оставить существующего, выдав ему роль admin."""
    email = resolve_admin_email()
    password, is_default = resolve_password("SEED_ADMIN_PASSWORD")
    user = await find_user(session, email)
    if user is None:
        user = User(
            first_name="Администратор",
            email=email,
            password_hash=await hash_password(password),
            roles=[roles[ADMIN_ROLE]],
        )
        session.add(user)
        created(f"администратор {email}")
    elif ADMIN_ROLE not in {role.code for role in user.roles}:
        user.roles.append(roles[ADMIN_ROLE])
        updated(f"администратор {email}: выдана роль {ADMIN_ROLE}")
    else:
        skipped(f"администратор {email} (пароль не меняется)")
    await session.flush()
    if is_default:
        warning(LOCAL_ONLY_WARNING)
    return user


async def apply(session: AsyncSession) -> None:
    """Применить справочники в переданной транзакции. Commit остаётся вызывающему."""
    section("Права")
    permissions = await ensure_permissions(session)
    section("Роли")
    roles = await ensure_roles(session, permissions)
    section("Администратор")
    await ensure_admin(session, roles)


async def main() -> None:
    async with session_scope() as session:
        await apply(session)
    done("Справочники применены. Повторный запуск безопасен.")


if __name__ == "__main__":
    run(main())
