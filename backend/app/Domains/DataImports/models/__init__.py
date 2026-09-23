from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImportBatch(Base):
    __tablename__ = "data_import_batches"
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(30))
    file_hash: Mapped[str] = mapped_column(String(64))
    base_revision: Mapped[int]
    status: Mapped[str] = mapped_column(String(30), default="validated")
    rows: Mapped[list] = mapped_column(JSONB)
    errors: Mapped[list] = mapped_column(JSONB)
    row_count: Mapped[int]
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
