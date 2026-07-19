"""Data access for wall notes."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.wall.models import Note, NoteStatus


class NoteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, note_id: uuid.UUID) -> Note | None:
        return await self._session.get(Note, note_id)

    async def get_active_for_user(self, user_id: uuid.UUID) -> Note | None:
        result = await self._session.execute(
            select(Note).where(Note.user_id == user_id, Note.status == NoteStatus.ACTIVE)
        )
        return result.scalar_one_or_none()

    async def occupied_cells(self) -> set[tuple[int, int]]:
        result = await self._session.execute(
            select(Note.x, Note.y).where(Note.status == NoteStatus.ACTIVE, Note.x.is_not(None))
        )
        return {(row.x, row.y) for row in result if row.x is not None and row.y is not None}

    async def list_by_tile(self, tile_id: int) -> list[Note]:
        result = await self._session.execute(
            select(Note)
            .where(Note.status == NoteStatus.ACTIVE, Note.tile_id == tile_id)
            .order_by(Note.created_at)
        )
        return list(result.scalars().all())

    async def count_active(self) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Note).where(Note.status == NoteStatus.ACTIVE)
        )
        return int(result.scalar_one())

    async def count_active_per_tile(self) -> dict[int, int]:
        result = await self._session.execute(
            select(Note.tile_id, func.count())
            .where(Note.status == NoteStatus.ACTIVE, Note.tile_id.is_not(None))
            .group_by(Note.tile_id)
        )
        return {int(tile_id): int(count) for tile_id, count in result if tile_id is not None}

    async def add(self, note: Note) -> Note:
        self._session.add(note)
        await self._session.flush()
        return note
