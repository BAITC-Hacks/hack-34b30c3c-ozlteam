from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path

import aiofiles
import aiofiles.os

from app.Domains.Files.contracts import FileContentMissing, InvalidStorageKey

CHUNK_SIZE = 64 * 1024


class LocalFileStorage:
    """Stores objects on a mounted volume (STORAGE_PATH) under `<uuid>/<safe filename>`."""

    def __init__(self, base_path: Path | str, chunk_size: int = CHUNK_SIZE):
        self._base_path = Path(base_path)
        self._chunk_size = chunk_size

    async def save(self, key: str, data: AsyncIterator[bytes]) -> int:
        path = self._resolve(key)
        await aiofiles.os.makedirs(path.parent, exist_ok=True)
        written = 0
        async with aiofiles.open(path, "wb") as handle:
            async for chunk in data:
                await handle.write(chunk)
                written += len(chunk)
        return written

    async def open(self, key: str) -> AsyncIterator[bytes]:
        path = self._resolve(key)
        if not await aiofiles.os.path.isfile(path):
            raise FileContentMissing(key)
        return self._stream(path)

    async def delete(self, key: str) -> None:
        path = self._resolve(key)
        with suppress(FileNotFoundError):
            await aiofiles.os.remove(path)
        # The per-file directory is only useful while it holds the object.
        with suppress(OSError):
            await aiofiles.os.rmdir(path.parent)

    async def _stream(self, path: Path) -> AsyncIterator[bytes]:
        async with aiofiles.open(path, "rb") as handle:
            while chunk := await handle.read(self._chunk_size):
                yield chunk

    def _resolve(self, key: str) -> Path:
        base = self._base_path.resolve()
        candidate = (base / key).resolve()
        if candidate == base or not candidate.is_relative_to(base):
            raise InvalidStorageKey(key)
        return candidate
