from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.Domains.Files.adapters.local_storage import LocalFileStorage
from app.Domains.Files.adapters.previews import PillowImageValidator, PillowPreviewRenderer
from app.Domains.Files.contracts import FileStorage, ImageValidator, PreviewRenderer
from app.Domains.Files.repositories.file_repository import SqlAlchemyFileRepository
from app.Domains.Files.services.file_service import FileService


@lru_cache
def get_file_storage() -> FileStorage:
    return LocalFileStorage(get_settings().storage_path)


@lru_cache
def get_preview_renderer() -> PreviewRenderer:
    return PillowPreviewRenderer()


@lru_cache
def get_image_validator() -> ImageValidator:
    return PillowImageValidator()


def get_file_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
    storage: Annotated[FileStorage, Depends(get_file_storage)],
    renderer: Annotated[PreviewRenderer, Depends(get_preview_renderer)],
    validator: Annotated[ImageValidator, Depends(get_image_validator)],
) -> FileService:
    return FileService(
        SqlAlchemyFileRepository(session),
        storage,
        renderer,
        validator,
        get_settings().max_upload_bytes,
    )
