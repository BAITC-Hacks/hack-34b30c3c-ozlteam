from collections.abc import AsyncIterator
from typing import Protocol


class FilesError(Exception):
    """Base error for the Files domain."""


class FileNotFound(FilesError):
    pass


class FileContentMissing(FilesError):
    """The database row exists but the stored object is gone."""


class UnsupportedFileType(FilesError):
    pass


class FileTooLarge(FilesError):
    pass


class EmptyFile(FilesError):
    pass


class InvalidImage(FilesError):
    pass


class PreviewUnavailable(FilesError):
    pass


class InvalidStorageKey(FilesError):
    pass


class FileStorage(Protocol):
    async def save(self, key: str, data: AsyncIterator[bytes]) -> int: ...

    async def open(self, key: str) -> AsyncIterator[bytes]: ...

    async def delete(self, key: str) -> None: ...


class PreviewRenderer(Protocol):
    def supports(self, kind: str) -> bool: ...

    async def render(self, kind: str, data: bytes) -> bytes: ...


class ImageValidator(Protocol):
    async def is_valid(self, data: bytes) -> bool: ...
