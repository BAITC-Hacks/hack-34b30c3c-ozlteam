from collections.abc import AsyncIterator
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.Domains.Files.adapters.previews import PREVIEW_CONTENT_TYPE
from app.Domains.Files.contracts import (
    EmptyFile,
    FileContentMissing,
    FileNotFound,
    FilesError,
    FileTooLarge,
    InvalidImage,
    PreviewUnavailable,
    UnsupportedFileType,
)
from app.Domains.Files.dependencies import get_file_service
from app.Domains.Files.DTO.file import UploadFile as UploadFileCommand
from app.Domains.Files.resources.file import FileResource
from app.Domains.Files.services.file_service import FileService

router = APIRouter(prefix="/files", tags=["Files"])
Service = Annotated[FileService, Depends(get_file_service)]

READ_CHUNK_SIZE = 64 * 1024
_STATUS_CODES: dict[type[FilesError], int] = {
    FileNotFound: 404,
    FileContentMissing: 404,
    PreviewUnavailable: 404,
    FileTooLarge: 413,
    UnsupportedFileType: 415,
    EmptyFile: 422,
    InvalidImage: 422,
}


def _http_error(error: FilesError) -> HTTPException:
    """Domain errors never cross the boundary; translate them here."""
    return HTTPException(status_code=_STATUS_CODES.get(type(error), 500), detail=str(error))


async def _chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while chunk := await upload.read(READ_CHUNK_SIZE):
        yield chunk


@router.post("", response_model=FileResource, status_code=201)
async def upload_file(file: UploadFile, service: Service):
    try:
        return await service.upload(
            UploadFileCommand(
                filename=file.filename or "",
                content_type=file.content_type or "",
                stream=_chunks(file),
                declared_size=file.size,
            )
        )
    except FilesError as error:
        raise _http_error(error) from error


@router.get("/{file_id}", response_model=FileResource)
async def get_file(file_id: UUID, service: Service):
    try:
        return await service.get(file_id)
    except FilesError as error:
        raise _http_error(error) from error


@router.get("/{file_id}/content")
async def get_file_content(file_id: UUID, service: Service):
    try:
        download = await service.download(file_id)
    except FilesError as error:
        raise _http_error(error) from error
    quoted = quote(download.filename, safe="")
    return StreamingResponse(
        download.stream,
        media_type=download.content_type,
        headers={
            "Content-Length": str(download.size_bytes),
            "Content-Disposition": f"attachment; filename*=UTF-8''{quoted}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{file_id}/preview")
async def get_file_preview(file_id: UUID, service: Service):
    try:
        preview = await service.preview(file_id)
    except FilesError as error:
        raise _http_error(error) from error
    return Response(
        content=preview,
        media_type=PREVIEW_CONTENT_TYPE,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )
