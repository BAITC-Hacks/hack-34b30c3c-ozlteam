from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.Domains.Notes.repositories.note_repository import SqlAlchemyNoteRepository
from app.Domains.Notes.services.note_service import NoteService


def get_note_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
) -> NoteService:
    return NoteService(SqlAlchemyNoteRepository(session))
