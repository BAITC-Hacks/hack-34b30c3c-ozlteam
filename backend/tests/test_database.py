import os
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_session
from app.main import app

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 to use the Compose database",
)


async def test_persistence_rollback_and_vectors():
    engine = create_async_engine(get_settings().database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def session_dependency():
        async with sessions() as session, session.begin():
            yield session

    app.dependency_overrides[get_session] = session_dependency
    note_id = None
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            result = await client.post("/api/v1/notes", json={"title": "Integration test"})
            assert result.status_code == 201
            note_id = result.json()["id"]
            async with engine.connect() as connection:
                assert (
                    await connection.scalar(
                        text("SELECT title FROM notes WHERE id = CAST(:id AS uuid)"),
                        {"id": note_id},
                    )
                    == "Integration test"
                )
                distance = await connection.scalar(
                    text("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector")
                )
                assert distance == 1.0
            assert (await client.delete(f"/api/v1/notes/{note_id}")).status_code == 204
            async with engine.connect() as connection:
                assert (
                    await connection.scalar(
                        text("SELECT count(*) FROM notes WHERE id = CAST(:id AS uuid)"),
                        {"id": note_id},
                    )
                    == 0
                )

        rollback_id = uuid4()
        with pytest.raises(RuntimeError):
            async with sessions() as session, session.begin():
                await session.execute(
                    text("INSERT INTO notes (id, title) VALUES (:id, 'rollback')"),
                    {"id": rollback_id},
                )
                raise RuntimeError("Abort transaction")
        async with engine.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM notes WHERE id = :id"),
                    {"id": rollback_id},
                )
                == 0
            )
    finally:
        app.dependency_overrides.clear()
        if note_id:
            async with engine.begin() as connection:
                await connection.execute(
                    text("DELETE FROM notes WHERE id = CAST(:id AS uuid)"),
                    {"id": note_id},
                )
        await engine.dispose()
