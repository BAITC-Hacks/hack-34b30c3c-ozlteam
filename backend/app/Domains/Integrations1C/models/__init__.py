from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IntegrationSource(Base):
    __tablename__ = "integration_sources"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    name: Mapped[str] = mapped_column(String(200))
    system: Mapped[str] = mapped_column(String(30), default="1c")
    revision: Mapped[int] = mapped_column(default=0)
    cursor: Mapped[str | None] = mapped_column(String(200))
    complete: Mapped[bool] = mapped_column(default=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExchangeBatch(Base):
    __tablename__ = "exchange_batches"
    __table_args__ = (UniqueConstraint("source_id", "batch_key"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    batch_key: Mapped[str] = mapped_column(String(200))
    payload_hash: Mapped[str] = mapped_column(String(64))
    revision: Mapped[int]
    row_count: Mapped[int]
    cursor: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)


class RestReport(Base):
    __tablename__ = "integration_rest_reports"
    __table_args__ = (
        CheckConstraint("quantity_multiplier IN (-1, 1)", name="ck_rest_report_sign"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))
    url: Mapped[str] = mapped_column(String(2048))
    items_path: Mapped[str] = mapped_column(String(200), default="")
    column_mapping: Mapped[dict] = mapped_column(JSONB, default=dict)
    quantity_multiplier: Mapped[int] = mapped_column(default=1)
    auth_env: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
