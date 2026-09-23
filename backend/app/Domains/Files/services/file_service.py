from collections.abc import AsyncIterator
from hashlib import sha256
from uuid import UUID, uuid4

from app.Domains.Files.contracts import (
    EmptyFile,
    FileNotFound,
    FileStorage,
    FileTooLarge,
    ImageValidator,
    InvalidImage,
    PreviewRenderer,
    PreviewUnavailable,
)
from app.Domains.Files.DTO.file import UploadFile
from app.Domains.Files.models.file import File
from app.Domains.Files.repositories.file_repository import FileRepository
from app.Domains.Files.resources.file import FileDownload, FileResource
from app.Domains.Files.services.file_types import (
    IMAGE,
    display_name,
    normalize_content_type,
    resolve_type,
    storage_name,
)


class FileService:
    def __init__(
        self,
        repository: FileRepository,
        storage: FileStorage,
        renderer: PreviewRenderer,
        validator: ImageValidator,
        max_upload_bytes: int,
    ):
        self.repository = repository
        self.storage = storage
        self.renderer = renderer
        self.validator = validator
        self.max_upload_bytes = max_upload_bytes

    async def upload(self, upload: UploadFile) -> FileResource:
        allowed = resolve_type(upload.filename, upload.content_type)
        if upload.declared_size is not None and upload.declared_size > self.max_upload_bytes:
            raise FileTooLarge(f"Upload exceeds {self.max_upload_bytes} bytes")

        file_id = uuid4()
        storage_key = f"{file_id}/{storage_name(upload.filename)}"
        digest = sha256()
        # Images are the only kind we must decode, so only they are buffered in memory,
        # and the buffer can never outgrow the upload limit enforced below.
        buffered: list[bytes] | None = [] if allowed.kind == IMAGE else None

        async def measured() -> AsyncIterator[bytes]:
            total = 0
            async for chunk in upload.stream:
                total += len(chunk)
                if total > self.max_upload_bytes:
                    raise FileTooLarge(f"Upload exceeds {self.max_upload_bytes} bytes")
                digest.update(chunk)
                if buffered is not None:
                    buffered.append(chunk)
                yield chunk

        try:
            size_bytes = await self.storage.save(storage_key, measured())
            if size_bytes == 0:
                raise EmptyFile("Uploaded file is empty")
            if buffered is not None and not await self.validator.is_valid(b"".join(buffered)):
                raise InvalidImage("Uploaded file is not a readable image")
        except BaseException:
            # Never leave a partial or rejected object behind.
            await self.storage.delete(storage_key)
            raise

        file = await self.repository.add(
            File(
                id=file_id,
                filename=display_name(upload.filename),
                content_type=normalize_content_type(upload.content_type),
                size_bytes=size_bytes,
                sha256=digest.hexdigest(),
                kind=allowed.kind,
                storage_key=storage_key,
                created_by=upload.created_by,
            )
        )
        return self._resource(file)

    async def get(self, file_id: UUID) -> FileResource:
        return self._resource(await self._require(file_id))

    async def download(self, file_id: UUID) -> FileDownload:
        file = await self._require(file_id)
        return FileDownload(
            filename=file.filename,
            content_type=file.content_type,
            size_bytes=file.size_bytes,
            stream=await self.storage.open(file.storage_key),
        )

    async def preview(self, file_id: UUID) -> bytes:
        file = await self._require(file_id)
        if not self.renderer.supports(file.kind):
            raise PreviewUnavailable(f"No preview for kind: {file.kind}")
        return await self.renderer.render(file.kind, await self._read(file.storage_key))

    async def _require(self, file_id: UUID) -> File:
        file = await self.repository.get(file_id)
        if file is None:
            raise FileNotFound(str(file_id))
        return file

    async def _read(self, storage_key: str) -> bytes:
        chunks = [chunk async for chunk in await self.storage.open(storage_key)]
        return b"".join(chunks)

    def _resource(self, file: File) -> FileResource:
        return FileResource.of(file, self.renderer.supports(file.kind))
