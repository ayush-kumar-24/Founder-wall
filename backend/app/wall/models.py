"""Wall ORM models: sticky notes placed on a fixed grid."""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base, TimestampMixin, value_enum


class NoteStatus(StrEnum):
    ACTIVE = "active"
    REMOVED = "removed"


class NoteColor(StrEnum):
    AMBER = "amber"
    ROSE = "rose"
    SKY = "sky"
    EMERALD = "emerald"
    VIOLET = "violet"
    SLATE = "slate"


class Note(Base, TimestampMixin):
    """A founder's sticky note. Placement (x, y) is assigned by the server.

    An active note occupies a unique cell; removing it releases the cell by
    setting the coordinates back to NULL (multiple NULLs are permitted, so
    removed notes never collide).
    """

    __tablename__ = "notes"
    __table_args__ = (
        UniqueConstraint("x", "y", name="uq_notes_cell"),
        CheckConstraint("x IS NULL OR x >= 0", name="x_non_negative"),
        CheckConstraint("y IS NULL OR y >= 0", name="y_non_negative"),
        # Enforce "one active note per founder" at the database level so two
        # concurrent creates can never both succeed. Partial index → only rows
        # with status='active' participate; removed notes are unconstrained.
        Index(
            "uq_notes_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
            sqlite_where=text("status = 'active'"),
        ),
        # Hot read path: notes within a tile filtered by status.
        Index("ix_notes_tile_status", "tile_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(String(512), nullable=False)
    color: Mapped[NoteColor] = mapped_column(
        value_enum(NoteColor),
        default=NoteColor.AMBER,
        nullable=False,
    )
    status: Mapped[NoteStatus] = mapped_column(
        value_enum(NoteStatus),
        default=NoteStatus.ACTIVE,
        index=True,
        nullable=False,
    )
    x: Mapped[int | None] = mapped_column(Integer, nullable=True)
    y: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tile_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
