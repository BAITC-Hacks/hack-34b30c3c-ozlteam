from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel

from app.Domains.Files.models.file import File

PREVIEW_PATH = "/api/v1/files/{file_id}/preview"


class FileResource(BaseModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    kind: str
    preview_url: str | None = None

    @classmethod
    def of(cls, file: File, previewable: bool) -> "FileResource":
        return cls(
            id=file.id,
            filename=file.filename,
            content_type=file.content_type,
            size_bytes=file.size_bytes,
            kind=file.kind,
            preview_url=PREVIEW_PATH.format(file_id=file.id) if previewable else None,
        )


@dataclass(frozen=True, slots=True)
class FileDownload:
    """Everything the HTTP boundary needs to stream a stored file back."""

    filename: str
    content_type: str
    size_bytes: int
    stream: AsyncIterator[bytes]
