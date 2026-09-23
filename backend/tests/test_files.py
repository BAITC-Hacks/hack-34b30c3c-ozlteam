import os
from contextlib import asynccontextmanager
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_session
from app.Domains.Files.adapters.local_storage import LocalFileStorage
from app.Domains.Files.adapters.previews import PillowImageValidator, PillowPreviewRenderer
from app.Domains.Files.contracts import FileTooLarge
from app.Domains.Files.controllers.http import router
from app.Domains.Files.dependencies import get_file_service, get_file_storage
from app.Domains.Files.DTO.file import UploadFile
from app.Domains.Files.models.file import File
from app.Domains.Files.services.file_service import FileService
from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import Permission, User

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DEFAULT_LIMIT = 25 * 1024 * 1024


class MemoryFileRepository:
    def __init__(self):
        self.files: dict[UUID, File] = {}

    async def add(self, file: File) -> File:
        file.id = file.id or uuid4()
        self.files[file.id] = file
        return file

    async def get(self, file_id: UUID) -> File | None:
        return self.files.get(file_id)

    async def delete(self, file: File) -> None:
        self.files.pop(file.id, None)


def png_bytes(size: tuple[int, int] = (8, 8), color: tuple[int, int, int] = (200, 30, 30)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def build_app(service: FileService) -> FastAPI:
    api = FastAPI()
    api.include_router(router, prefix="/api/v1")
    api.dependency_overrides[get_current_user] = lambda: User(
        id=uuid4(),
        first_name="Тест",
        roles=[],
        permissions=[Permission(code=code, name=code) for code in ("files.read", "files.write")],
    )
    api.dependency_overrides[get_file_service] = lambda: service
    return api


def build_service(tmp_path, repository, max_upload_bytes: int = DEFAULT_LIMIT) -> FileService:
    return FileService(
        repository,
        LocalFileStorage(tmp_path),
        PillowPreviewRenderer(),
        PillowImageValidator(),
        max_upload_bytes,
    )


@asynccontextmanager
async def files_client(tmp_path, max_upload_bytes: int = DEFAULT_LIMIT):
    repository = MemoryFileRepository()
    api = build_app(build_service(tmp_path, repository, max_upload_bytes))
    async with AsyncClient(transport=ASGITransport(app=api), base_url="http://test") as client:
        yield client, repository


def stored_files(tmp_path) -> list:
    return [path for path in tmp_path.rglob("*") if path.is_file()]


async def test_upload_png_returns_resource_and_stores_content(tmp_path):
    content = png_bytes()
    async with files_client(tmp_path) as (client, repository):
        response = await client.post(
            "/api/v1/files",
            files={"file": ("накладная №1.png", content, "image/png")},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["filename"] == "накладная №1.png"
        assert body["content_type"] == "image/png"
        assert body["size_bytes"] == len(content)
        assert body["kind"] == "image"
        assert body["preview_url"] == f"/api/v1/files/{body['id']}/preview"
        assert set(body) == {"id", "filename", "content_type", "size_bytes", "kind", "preview_url"}

        stored = repository.files[UUID(body["id"])]
        # The client supplied name never reaches the filesystem verbatim.
        assert stored.storage_key.endswith("/1.png")
        UUID(stored.storage_key.split("/")[0])
        assert len(stored.sha256) == 64
        assert stored_files(tmp_path)[0].read_bytes() == content

        assert (await client.get(f"/api/v1/files/{body['id']}")).json() == body
        download = await client.get(f"/api/v1/files/{body['id']}/content")
        assert download.status_code == 200
        assert download.content == content
        assert download.headers["content-type"] == "image/png"


async def test_upload_strips_client_supplied_path(tmp_path):
    async with files_client(tmp_path) as (client, repository):
        response = await client.post(
            "/api/v1/files",
            files={"file": ("../../etc/passwd.png", png_bytes(), "image/png")},
        )
        assert response.status_code == 201, response.text
        stored = repository.files[UUID(response.json()["id"])]
        assert response.json()["filename"] == "passwd.png"
        assert stored.storage_key.endswith("/passwd.png")
        UUID(stored.storage_key.split("/")[0])
        assert stored_files(tmp_path)[0].parent.parent == tmp_path


async def test_upload_over_the_limit_is_rejected_and_leaves_no_object(tmp_path):
    async with files_client(tmp_path, max_upload_bytes=1024) as (client, repository):
        response = await client.post(
            "/api/v1/files",
            files={"file": ("чертёж.pdf", os.urandom(4096), "application/pdf")},
        )
        assert response.status_code == 413, response.text
        assert repository.files == {}
        assert stored_files(tmp_path) == []


async def test_streamed_upload_over_the_limit_is_rejected(tmp_path):
    repository = MemoryFileRepository()
    service = build_service(tmp_path, repository, max_upload_bytes=1024)

    async def stream():
        for _ in range(4):
            yield os.urandom(512)

    # An upload without a declared size must still be cut off while streaming.
    with pytest.raises(FileTooLarge):
        await service.upload(
            UploadFile(filename="scan.pdf", content_type="application/pdf", stream=stream())
        )
    assert repository.files == {}
    assert stored_files(tmp_path) == []


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("payload.exe", "application/octet-stream"),
        ("notes.txt", "text/plain"),
        ("archive.zip", "application/zip"),
        ("noextension", "image/png"),
        # Extension on the allowlist, but the declared type disagrees.
        ("disguised.png", "text/html"),
    ],
)
async def test_forbidden_types_are_rejected(tmp_path, filename, content_type):
    async with files_client(tmp_path) as (client, repository):
        response = await client.post(
            "/api/v1/files",
            files={"file": (filename, b"payload-bytes", content_type)},
        )
        assert response.status_code == 415, response.text
        assert repository.files == {}
        assert stored_files(tmp_path) == []


async def test_upload_rejects_content_that_is_not_a_real_image(tmp_path):
    async with files_client(tmp_path) as (client, repository):
        response = await client.post(
            "/api/v1/files",
            files={"file": ("fake.png", b"definitely not a png", "image/png")},
        )
        assert response.status_code == 422, response.text
        assert repository.files == {}
        assert stored_files(tmp_path) == []


async def test_png_preview_is_downscaled_png(tmp_path):
    async with files_client(tmp_path) as (client, _):
        created = await client.post(
            "/api/v1/files",
            files={"file": ("plan.png", png_bytes((2400, 1200)), "image/png")},
        )
        assert created.status_code == 201, created.text
        preview = await client.get(created.json()["preview_url"])
        assert preview.status_code == 200, preview.text
        assert preview.headers["content-type"] == "image/png"
        with Image.open(BytesIO(preview.content)) as image:
            assert image.format == "PNG"
            assert max(image.size) == 1200
            assert image.size == (1200, 600)


async def test_documents_have_no_preview(tmp_path):
    async with files_client(tmp_path) as (client, _):
        created = await client.post(
            "/api/v1/files",
            files={"file": ("акт.docx", b"PK\x03\x04 minimal docx", DOCX_CONTENT_TYPE)},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["kind"] == "doc"
        assert body["preview_url"] is None
        assert (await client.get(f"/api/v1/files/{body['id']}/preview")).status_code == 404


async def test_unknown_file_returns_404(tmp_path):
    unknown = uuid4()
    async with files_client(tmp_path) as (client, _):
        assert (await client.get(f"/api/v1/files/{unknown}")).status_code == 404
        assert (await client.get(f"/api/v1/files/{unknown}/content")).status_code == 404
        assert (await client.get(f"/api/v1/files/{unknown}/preview")).status_code == 404


@pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 to use the Compose database",
)
async def test_upload_persists_to_the_database(tmp_path):
    engine = create_async_engine(get_settings().database_url)
    content = png_bytes((64, 64))
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            sessions = async_sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )

            async def session_dependency():
                async with sessions() as session, session.begin():
                    yield session

            api = FastAPI()
            api.include_router(router, prefix="/api/v1")
            async with sessions() as session, session.begin():
                actor = User(first_name="Тест", roles=[], permissions=[])
                session.add(actor)
                await session.flush()
                actor_id = actor.id
            api.dependency_overrides[get_current_user] = lambda: User(
                id=actor_id,
                first_name="Тест",
                roles=[],
                permissions=[
                    Permission(code=code, name=code) for code in ("files.read", "files.write")
                ],
            )
            api.dependency_overrides[get_session] = session_dependency
            api.dependency_overrides[get_file_storage] = lambda: LocalFileStorage(tmp_path)
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=api), base_url="http://test"
                ) as client:
                    created = await client.post(
                        "/api/v1/files",
                        files={"file": ("накладная.png", content, "image/png")},
                    )
                    assert created.status_code == 201, created.text
                    file_id = created.json()["id"]
                    async with sessions() as session:
                        row = (
                            await session.execute(
                                text(
                                    "SELECT filename, content_type, size_bytes, kind, storage_key "
                                    "FROM files WHERE id = CAST(:id AS uuid)"
                                ),
                                {"id": file_id},
                            )
                        ).one()
                        assert row.filename == "накладная.png"
                        assert row.content_type == "image/png"
                        assert row.size_bytes == len(content)
                        assert row.kind == "image"
                        assert row.storage_key.endswith("/file.png")
                        assert UUID(file_id).version == 7
                    assert (await client.get(f"/api/v1/files/{file_id}")).status_code == 200
                    preview = await client.get(f"/api/v1/files/{file_id}/preview")
                    assert preview.status_code == 200, preview.text
            finally:
                api.dependency_overrides.clear()
                await transaction.rollback()
    finally:
        await engine.dispose()
