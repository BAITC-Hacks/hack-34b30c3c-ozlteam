from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImportPackage(Base):
    __tablename__ = "import_packages"
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    job_id: Mapped[UUID | None] = mapped_column(ForeignKey("jobs.id"))
    files: Mapped[list] = mapped_column(JSONB, default=list)
    options: Mapped[dict] = mapped_column(JSONB, default=dict)
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    issues: Mapped[list] = mapped_column(JSONB, default=list, deferred=True)
    products: Mapped[list] = mapped_column(JSONB, default=list, deferred=True)
    issue_count: Mapped[int] = mapped_column(default=0)
    row_count: Mapped[int] = mapped_column(default=0)
    processed_rows: Mapped[int] = mapped_column(default=0)
    expected_revision: Mapped[int | None]
    error: Mapped[str | None] = mapped_column(String(1000))
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ImportPackageChunk(Base):
    __tablename__ = "import_package_chunks"
    __table_args__ = (UniqueConstraint("package_id", "position"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    package_id: Mapped[UUID] = mapped_column(ForeignKey("import_packages.id"), index=True)
    position: Mapped[int]
    rows: Mapped[list] = mapped_column(JSONB)
    applied: Mapped[bool] = mapped_column(default=False)


class ImportIdentity(Base):
    """Confirmed adapter identity, preserving textual codes independently of UUIDs."""

    __tablename__ = "import_identities"
    __table_args__ = (UniqueConstraint("source_id", "kind", "code", "characteristic"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    source_id: Mapped[UUID] = mapped_column(ForeignKey("integration_sources.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    code: Mapped[str] = mapped_column(String(200))
    characteristic: Mapped[str] = mapped_column(String(200), default="")
    external_id: Mapped[str] = mapped_column(String(200))
    product_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_products.id"))


class ImportPackageEvidence(Base):
    __tablename__ = "import_package_evidence"
    __table_args__ = (UniqueConstraint("package_id", "position"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("uuidv7()"))
    package_id: Mapped[UUID] = mapped_column(ForeignKey("import_packages.id"), index=True)
    position: Mapped[int]
    rows: Mapped[list] = mapped_column(JSONB)
