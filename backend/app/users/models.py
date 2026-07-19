"""User (founder) ORM models."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base, TimestampMixin


class User(Base, TimestampMixin):
    """A founder. Identity comes from Google; presence on the wall is anonymous."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    # Public, anonymous handle shown on the wall — never the real name/email.
    handle: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # Real display name kept private; used only in the authenticated /auth/me view.
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_moderator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
