"""Wall request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.wall.models import NoteColor


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=280)
    color: NoteColor = NoteColor.AMBER
    # Optional name the poster types. Empty/blank → anonymous.
    author_name: str | None = Field(default=None, max_length=80)

    @field_validator("content")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Note content cannot be blank")
        return cleaned

    @field_validator("author_name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class NoteUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=280)
    color: NoteColor | None = None

    @field_validator("content")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Note content cannot be blank")
        return cleaned


class NotePublic(BaseModel):
    """Public view of a note. Anonymous by default; `author_name` is present
    only when the founder chose to reveal their identity on this note."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    color: NoteColor
    author_name: str | None = None
    likes: int = 0
    comment_count: int = 0
    x: int
    y: int
    tile_id: int
    created_at: datetime


class NoteCreated(NotePublic):
    """Returned once to the creator. Carries the secret delete token so the
    posting browser can later remove this note without an account. The token is
    never included in any public read."""

    delete_token: str


class NoteDelete(BaseModel):
    """Token proving the caller created this note (device-remembered)."""

    token: str = Field(min_length=1)


class NoteOwned(NotePublic):
    """The note as seen by its owner (adds mutability affordances)."""

    updated_at: datetime


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=280)
    author_name: str | None = Field(default=None, max_length=80)

    @field_validator("content")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Comment cannot be blank")
        return cleaned

    @field_validator("author_name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CommentPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    author_name: str | None = None
    created_at: datetime


class LikeCount(BaseModel):
    likes: int


class TileSummary(BaseModel):
    tile_id: int
    col: int
    row: int
    x0: int
    y0: int
    width: int
    height: int
    note_count: int


class WallManifest(BaseModel):
    columns: int
    rows: int
    tile_size: int
    tiles_across: int
    tiles_down: int
    total_tiles: int
    total_notes: int
    tiles: list[TileSummary]


class TileDetail(BaseModel):
    tile_id: int
    notes: list[NotePublic]
