"""Wall request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.wall.models import NoteColor


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=280)
    color: NoteColor = NoteColor.AMBER

    @field_validator("content")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Note content cannot be blank")
        return cleaned


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
    """Anonymous public view of a note — owner identity is never exposed."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    color: NoteColor
    x: int
    y: int
    tile_id: int
    created_at: datetime


class NoteOwned(NotePublic):
    """The note as seen by its owner (adds mutability affordances)."""

    updated_at: datetime


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
