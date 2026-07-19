"""Moderation ORM models: the review queue."""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base, TimestampMixin, value_enum


class ReportStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReportReason(StrEnum):
    SPAM = "spam"
    ABUSE = "abuse"
    OFF_TOPIC = "off_topic"
    OTHER = "other"


class ModerationReport(Base, TimestampMixin):
    """A report raised against a note, awaiting moderator review."""

    __tablename__ = "moderation_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("notes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[ReportReason] = mapped_column(value_enum(ReportReason), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        value_enum(ReportStatus),
        default=ReportStatus.OPEN,
        index=True,
        nullable=False,
    )
    resolution: Mapped[str | None] = mapped_column(String(512), nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
