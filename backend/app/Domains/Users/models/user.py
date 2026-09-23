from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True, index=True),
)

user_permissions = Table(
    "user_permissions",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_id",
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_id",
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    permissions: Mapped[list[Permission]] = relationship(
        secondary=role_permissions,
        lazy="raise",
        passive_deletes=True,
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    first_name: Mapped[str] = mapped_column(String(200))
    last_name: Mapped[str | None] = mapped_column(String(200))
    middle_name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    password_hash: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    roles: Mapped[list[Role]] = relationship(
        secondary=user_roles,
        lazy="raise",
        passive_deletes=True,
    )
    permissions: Mapped[list[Permission]] = relationship(
        secondary=user_permissions,
        lazy="raise",
        passive_deletes=True,
    )

    __table_args__ = (Index("ix_users_email_lower", func.lower(email), unique=True),)

    @property
    def full_name(self) -> str:
        """Фамилия Имя Отчество, skipping missing components."""
        return " ".join(
            part.strip()
            for part in (self.last_name, self.first_name, self.middle_name)
            if part and part.strip()
        )

    def get_permissions(self) -> set[str]:
        """Return distinct direct and role permission codes from loaded relationships."""
        return {permission.code for permission in self.permissions} | {
            permission.code for role in self.roles for permission in role.permissions
        }

    def has_permission(self, code: str) -> bool:
        return code in self.get_permissions()
