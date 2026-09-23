from uuid import UUID

from app.Domains.Notes.DTO.note import CreateNote
from app.Domains.Notes.repositories.note_repository import NoteRepository
from app.Domains.Notes.resources.note import NoteResource


class NoteNotFound(Exception):
    pass


class NoteService:
    def __init__(self, repository: NoteRepository):
        self.repository = repository

    async def list(self, limit: int, offset: int) -> list[NoteResource]:
        return [
            NoteResource.model_validate(note) for note in await self.repository.list(limit, offset)
        ]

    async def create(self, data: CreateNote) -> NoteResource:
        return NoteResource.model_validate(await self.repository.add(data.title))

    async def delete(self, note_id: UUID) -> None:
        note = await self.repository.get(note_id)
        if note is None:
            raise NoteNotFound
        await self.repository.delete(note)
