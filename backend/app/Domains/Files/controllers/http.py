from collections.abc import AsyncIterator
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.core.access import require_permission
from app.core.errors import ERROR_RESPONSES
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
from app.Domains.Users.models.user import User

router = APIRouter(prefix="/files", tags=["Files"], responses=ERROR_RESPONSES)
Service = Annotated[FileService, Depends(get_file_service)]
Reader = Annotated[User, Depends(require_permission("files.read"))]
Writer = Annotated[User, Depends(require_permission("files.write"))]

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


@router.get(
    "",
    response_model=list[FileResource],
    summary="Список загруженных файлов",
    description="Последние загруженные файлы в общем рабочем пространстве. Требуется files.read.",
)
async def list_files(
    service: Service,
    user: Reader,
    limit: Annotated[int, Query(ge=1, le=100, description="Число файлов на странице")] = 20,
    offset: Annotated[int, Query(ge=0, description="Число пропущенных файлов")] = 0,
):
    return await service.list_recent(limit, offset)


@router.post("", response_model=FileResource, status_code=201)
async def upload_file(file: UploadFile, service: Service, user: Writer):
    try:
        return await service.upload(
            UploadFileCommand(
                filename=file.filename or "",
                content_type=file.content_type or "",
                stream=_chunks(file),
                declared_size=file.size,
                created_by=user.id,
            )
        )
    except FilesError as error:
        raise _http_error(error) from error


@router.get("/{file_id}", response_model=FileResource)
async def get_file(file_id: UUID, service: Service, user: Reader):
    try:
        return await service.get(file_id)
    except FilesError as error:
        raise _http_error(error) from error


@router.get(
    "/{file_id}/content",
    response_class=StreamingResponse,
    summary="Скачать исходный файл",
    description="Тип содержимого соответствует загруженному файлу. Доступ по files.read.",
    responses={
        200: {
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
            "headers": {"Content-Disposition": {"schema": {"type": "string"}}},
        }
    },
)
async def get_file_content(file_id: UUID, service: Service, user: Reader):
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


@router.get(
    "/{file_id}/preview",
    response_class=Response,
    summary="Предпросмотр файла",
    responses={
        200: {
            "content": {PREVIEW_CONTENT_TYPE: {"schema": {"type": "string", "format": "binary"}}}
        },
        422: {"description": "Предпросмотр для этого формата недоступен"},
    },
)
async def get_file_preview(file_id: UUID, service: Service, user: Reader):
    try:
        preview = await service.preview(file_id)
    except FilesError as error:
        raise _http_error(error) from error
    return Response(
        content=preview,
        media_type=PREVIEW_CONTENT_TYPE,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )
