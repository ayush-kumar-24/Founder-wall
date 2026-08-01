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
        # Hot read path: notes within a tile filtered by status.
        Index("ix_notes_tile_status", "tile_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Optional: posting requires no account. Legacy notes keep their author;
    # new open-wall notes are user-less (NULL).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    content: Mapped[str] = mapped_column(String(512), nullable=False)
    # Optional name the poster typed. NULL = anonymous.
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Required for new posts: the startup / org they're from, or what they're
    # building. Nullable so legacy rows (posted before this) stay valid.
    affiliation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Secret returned once to the creator; lets that browser delete its own note
    # without an account. NULL notes can only be removed by a moderator.
    delete_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    # Public, global engagement counters, visible to everyone. `likes` is deduped
    # per-browser client-side; `comment_count` is denormalised so tile reads stay
    # a plain column read.
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Comment(Base, TimestampMixin):
    """A public comment on a note. Unlimited per note."""

    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_note", "note_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("notes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(String(280), nullable=False)
    # Optional name the commenter typed. NULL = anonymous.
    author_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Required for new comments: startup / org, or what they're building.
    affiliation: Mapped[str | None] = mapped_column(String(120), nullable=True)
