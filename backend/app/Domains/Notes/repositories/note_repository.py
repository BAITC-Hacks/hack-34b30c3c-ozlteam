from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Notes.models.note import Note


class NoteRepository(Protocol):
    async def list(self, limit: int, offset: int) -> list[Note]: ...
    async def add(self, title: str) -> Note: ...
    async def get(self, note_id: UUID) -> Note | None: ...
    async def delete(self, note: Note) -> None: ...


class SqlAlchemyNoteRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, limit: int, offset: int) -> list[Note]:
        result = await self.session.scalars(
            select(Note).order_by(Note.created_at.desc(), Note.id).limit(limit).offset(offset)
        )
        return list(result)

    async def add(self, title: str) -> Note:
        note = Note(title=title)
        self.session.add(note)
        await self.session.flush()
        await self.session.refresh(note)
        return note

    async def get(self, note_id: UUID) -> Note | None:
        return await self.session.get(Note, note_id)

    async def delete(self, note: Note) -> None:
        await self.session.delete(note)
        await self.session.flush()
