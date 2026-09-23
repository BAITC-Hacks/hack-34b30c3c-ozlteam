"""Общие средства скриптов наполнения: сессия, запуск и вывод в консоль."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Coroutine
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, session_factory


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Одна транзакция на запуск скрипта: commit при успехе, rollback при ошибке."""
    async with session_factory() as session, session.begin():
        yield session


def run(main: Coroutine[Any, Any, None]) -> None:
    """Выполнить сценарий и закрыть пул соединений."""

    async def entrypoint() -> None:
        try:
            await main
        finally:
            await engine.dispose()

    asyncio.run(entrypoint())


def section(title: str) -> None:
    print(f"\n{title}")


def created(what: str) -> None:
    print(f"  + создано     {what}")


def skipped(what: str) -> None:
    print(f"  = существует  {what}")


def updated(what: str) -> None:
    print(f"  ~ обновлено   {what}")


def removed(what: str) -> None:
    print(f"  - удалено     {what}")


def warning(text: str) -> None:
    print(f"\n! {text}")


def done(text: str) -> None:
    print(f"\n{text}")
