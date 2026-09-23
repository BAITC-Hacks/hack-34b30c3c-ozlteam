from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

import app.models  # noqa: F401 - регистрирует таблицы для междоменных внешних ключей
from app.core.config import get_settings
from app.core.database import engine
from app.core.security_middleware import MaxBodySizeMiddleware, SecurityHeadersMiddleware
from app.Domains.Ai.controllers.http import router as ai_router
from app.Domains.Files.controllers.http import router as files_router
from app.Domains.Jobs.controllers.http import router as jobs_router
from app.Domains.Notes.controllers.http import router as notes_router
from app.Domains.Notes.services.note_service import NoteNotFound
from app.Domains.Security.controllers.http import router as security_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


settings = get_settings()

app = FastAPI(title="Hackalem API", version="0.1.0", lifespan=lifespan)

# Порядок важен: ограничение размера отрабатывает раньше всех остальных.
app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_upload_bytes)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(notes_router, prefix="/api/v1")
app.include_router(security_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Validation errors can otherwise echo submitted passwords in the response.
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {key: error[key] for key in ("type", "loc", "msg")} for error in exc.errors()
            ]
        },
    )


@app.exception_handler(NoteNotFound)
async def note_not_found(request: Request, exc: NoteNotFound):
    return JSONResponse(status_code=404, content={"detail": "Note not found"})


@app.get("/api/health/live", tags=["Health"])
async def live():
    return {"status": "ok"}


@app.get("/api/health/ready", tags=["Health"])
async def ready():
    try:
        async with engine.connect() as connection:
            version = await connection.scalar(
                text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
            )
            if version is None:
                return JSONResponse(status_code=503, content={"status": "not_ready"})
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ok", "pgvector": version}
