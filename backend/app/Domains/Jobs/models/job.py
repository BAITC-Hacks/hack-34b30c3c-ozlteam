from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    kind: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    # [{"name": "Читаю документ", "state": "pending"}, ...]; always replaced, never mutated
    # in place, so SQLAlchemy sees the change.
    steps: Mapped[list[dict[str, str]]] = mapped_column(JSONB, default=list)
    result: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    # Durable outbox: a committed job contains everything required to republish it.
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict, server_default="{}")
    dispatch_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
