from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class UploadFile:
    """A validated-at-the-boundary upload command: metadata plus the raw byte stream."""

    filename: str
    content_type: str
    stream: AsyncIterator[bytes]
    declared_size: int | None = None
    created_by: UUID | None = None
