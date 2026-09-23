from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.Domains.Notes.dependencies import get_note_service
from app.Domains.Notes.models.note import Note
from app.Domains.Notes.services.note_service import NoteService
from app.main import app


class MemoryRepository:
    def __init__(self):
        self.notes = {}

    async def list(self, limit, offset):
        return list(self.notes.values())[offset : offset + limit]

    async def add(self, title):
        note = Note(id=uuid4(), title=title, created_at=datetime.now(UTC))
        self.notes[note.id] = note
        return note

    async def get(self, note_id):
        return self.notes.get(note_id)

    async def delete(self, note):
        del self.notes[note.id]


@pytest.fixture
async def client():
    service = NoteService(MemoryRepository())
    app.dependency_overrides[get_note_service] = lambda: service
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def test_note_lifecycle(client):
    created = await client.post("/api/v1/notes", json={"title": "  First idea  "})
    assert created.status_code == 201
    note = created.json()
    assert note["title"] == "First idea"
    assert (await client.get("/api/v1/notes")).json() == [note]
    assert (await client.delete(f"/api/v1/notes/{note['id']}")).status_code == 204
    assert (await client.get("/api/v1/notes")).json() == []
    assert (await client.delete(f"/api/v1/notes/{note['id']}")).status_code == 404


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
async def test_invalid_title(client, title):
    assert (await client.post("/api/v1/notes", json={"title": title})).status_code == 422


async def test_pagination_validation(client):
    assert (await client.get("/api/v1/notes?limit=101")).status_code == 422
    assert (await client.get("/api/v1/notes?offset=-1")).status_code == 422
