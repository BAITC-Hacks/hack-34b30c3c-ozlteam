from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CalculationRun(Base):
    __tablename__ = "replenishment_runs"
    __table_args__ = (UniqueConstraint("created_by", "idempotency_key"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    warehouse_id: Mapped[UUID] = mapped_column(index=True)
    category_id: Mapped[UUID | None]
    as_of: Mapped[date] = mapped_column(Date)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    algorithm_version: Mapped[str] = mapped_column(String(64))
    parameters: Mapped[dict] = mapped_column(JSONB)
    input_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    source_versions: Mapped[list] = mapped_column(JSONB, default=list)
    warnings: Mapped[list] = mapped_column(JSONB, default=list)
    error: Mapped[str | None] = mapped_column(String(500))
    job_id: Mapped[UUID | None] = mapped_column(ForeignKey("jobs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Recommendation(Base):
    __tablename__ = "replenishment_recommendations"
    __table_args__ = (UniqueConstraint("run_id", "product_id"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    run_id: Mapped[UUID] = mapped_column(ForeignKey("replenishment_runs.id"), index=True)
    product_id: Mapped[UUID] = mapped_column(index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(index=True)
    warehouse_id: Mapped[UUID] = mapped_column(index=True)
    sku: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(500))
    unit: Mapped[str] = mapped_column(String(100))
    recommended_quantity: Mapped[Decimal] = mapped_column(Numeric(24, 6))
    status: Mapped[str] = mapped_column(String(20))
    urgency: Mapped[str] = mapped_column(String(20), index=True)
    explanation: Mapped[str] = mapped_column(String(2000))
    details: Mapped[dict] = mapped_column(JSONB)
