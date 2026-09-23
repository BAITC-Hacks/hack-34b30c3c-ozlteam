"""Демонстрационные данные поверх справочников: команда проекта и заметки.

Запуск: `python -m app.seed.mock` — наполнить, `python -m app.seed.mock --reset` — удалить
только эти данные. Обе операции идемпотентны и не трогают справочники из `app.seed.seed`.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Notes.models.note import Note
from app.Domains.Users.models import Permission, Role, User
from app.seed.runner import (
    created,
    done,
    removed,
    run,
    section,
    session_scope,
    skipped,
    updated,
    warning,
)
from app.seed.seed import find_user, hash_password, resolve_password


@dataclass(frozen=True)
class MockUser:
    email: str
    last_name: str
    first_name: str
    middle_name: str
    phone: str
    position: str
    role: str
    permissions: tuple[str, ...] = ()


MOCK_USERS: tuple[MockUser, ...] = (
    MockUser(
        email="a.gusev@hackalem.local",
        last_name="Гусев",
        first_name="Артём",
        middle_name="Николаевич",
        phone="+77011234501",
        position="Руководитель направления",
        role="manager",
        permissions=(
            "replenishment.run",
            "orders.write",
            "orders.approve",
            "orders.export",
        ),
    ),
    MockUser(
        email="s.kovalev@hackalem.local",
        last_name="Ковалёв",
        first_name="Сергей",
        middle_name="Петрович",
        phone="+77011234502",
        position="Диспетчер",
        role="dispatcher",
    ),
    MockUser(
        email="a.ibragimova@hackalem.local",
        last_name="Ибрагимова",
        first_name="Алия",
        middle_name="Маратовна",
        phone="+77011234503",
        position="Специалист по документам",
        role="viewer",
        # Личное право сверх роли: документы по отправкам загружает именно он.
        permissions=("files.write",),
    ),
)

MOCK_NOTES: tuple[str, ...] = (
    "Отправка KZ-1183 Алматы — Астана: выехала, прибытие завтра к 14:00",
    "CMR по отправке KZ-1176 пришла без отметки получателя — запросить скан",
    "Приёмка на складе Алматы: 18 паллет вместо 20, составить акт недостачи",
    "Фура на Хоргосе вторые сутки: ждём выпуск декларации, предупредить клиента",
    "Пересчитать ставку для сборного груза 12 т — две машины дешевле одной фуры",
)

MOCK_EMAILS: tuple[str, ...] = tuple(user.email for user in MOCK_USERS)


async def load_roles(session: AsyncSession) -> dict[str, Role]:
    codes = {user.role for user in MOCK_USERS}
    roles = {
        role.code: role for role in await session.scalars(select(Role).where(Role.code.in_(codes)))
    }
    missing = sorted(codes - roles.keys())
    if missing:
        raise SystemExit(
            f"Не найдены роли: {', '.join(missing)}. Сначала выполните `python -m app.seed.seed`."
        )
    return roles


async def load_permissions(session: AsyncSession) -> dict[str, Permission]:
    codes = {code for user in MOCK_USERS for code in user.permissions}
    if not codes:
        return {}
    permissions = {
        permission.code: permission
        for permission in await session.scalars(
            select(Permission).where(Permission.code.in_(codes))
        )
    }
    missing = sorted(codes - permissions.keys())
    if missing:
        raise SystemExit(
            f"Не найдены права: {', '.join(missing)}. Сначала выполните `python -m app.seed.seed`."
        )
    return permissions


async def ensure_users(session: AsyncSession) -> None:
    """Создать демо-пользователей и добавить недостающие личные права."""
    roles = await load_roles(session)
    permissions = await load_permissions(session)
    password, is_default = resolve_password("SEED_MOCK_PASSWORD")
    for person in MOCK_USERS:
        existing = await find_user(session, person.email)
        if existing is not None:
            granted = {permission.code for permission in existing.permissions}
            missing = [code for code in person.permissions if code not in granted]
            if missing:
                existing.permissions.extend(permissions[code] for code in missing)
                updated(f"{person.position}: {person.email} — добавлены права {', '.join(missing)}")
            else:
                skipped(f"{person.position}: {person.email}")
            continue
        session.add(
            User(
                first_name=person.first_name,
                last_name=person.last_name,
                middle_name=person.middle_name,
                phone=person.phone,
                email=person.email,
                password_hash=await hash_password(password),
                roles=[roles[person.role]],
                permissions=[permissions[code] for code in person.permissions],
            )
        )
        created(f"{person.position}: {person.email} (роль {person.role})")
    await session.flush()
    if is_default:
        warning(
            "Демо-пользователи используют пароль по умолчанию — только для локальной разработки. "
            "Задайте SEED_MOCK_PASSWORD, если стенд доступен не только вам."
        )


async def ensure_notes(session: AsyncSession) -> None:
    """Создать демонстрационные заметки; естественный ключ — заголовок."""
    existing = set(await session.scalars(select(Note.title).where(Note.title.in_(MOCK_NOTES))))
    for title in MOCK_NOTES:
        if title in existing:
            skipped(f"заметка «{title}»")
            continue
        session.add(Note(title=title))
        created(f"заметка «{title}»")
    await session.flush()


async def apply(session: AsyncSession) -> None:
    """Наполнить демо-данными в переданной транзакции. Commit остаётся вызывающему."""
    section("Пользователи")
    await ensure_users(session)
    section("Заметки")
    await ensure_notes(session)


async def reset(session: AsyncSession) -> None:
    # Заметки удаляются по совпадению с текущим MOCK_NOTES: если список поменяли,
    # прежние демо-заметки останутся в базе и их придётся убрать вручную.
    """Удалить только демо-данные: справочники, права, роли и администратор не затрагиваются."""
    section("Удаление демо-данных")
    users = await session.execute(delete(User).where(func.lower(User.email).in_(MOCK_EMAILS)))
    notes = await session.execute(delete(Note).where(Note.title.in_(MOCK_NOTES)))
    removed(f"пользователей: {users.rowcount}")
    removed(f"заметок: {notes.rowcount}")
    await session.flush()


async def main(reset_requested: bool) -> None:
    async with session_scope() as session:
        if reset_requested:
            await reset(session)
        else:
            await apply(session)
    if reset_requested:
        done("Демо-данные удалены. Справочники и администратор сохранены.")
    else:
        done("Демо-данные применены. Повторный запуск безопасен.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.seed.mock",
        description="Демонстрационные данные поверх справочников app.seed.seed.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="удалить только демо-данные, не трогая справочники и администратора",
    )
    return parser.parse_args()


if __name__ == "__main__":
    run(main(parse_args().reset))
