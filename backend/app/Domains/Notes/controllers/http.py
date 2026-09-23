from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.Domains.Notes.dependencies import get_note_service
from app.Domains.Notes.DTO.note import CreateNote
from app.Domains.Notes.resources.note import NoteResource
from app.Domains.Notes.services.note_service import NoteService

router = APIRouter(prefix="/notes", tags=["Notes"])
Service = Annotated[NoteService, Depends(get_note_service)]


@router.get("", response_model=list[NoteResource])
async def list_notes(
    service: Service,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return await service.list(limit, offset)


@router.post("", response_model=NoteResource, status_code=201)
async def create_note(data: CreateNote, service: Service):
    return await service.create(data)


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: UUID, service: Service):
    await service.delete(note_id)
    return Response(status_code=204)
