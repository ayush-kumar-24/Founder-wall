"""Wall domain logic: note CRUD, placement, and realtime broadcast."""

from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.moderation.screener import ContentScreener
from app.realtime.pubsub import EventBus
from app.realtime.schemas import EventType, WallEvent
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError
from app.stats.counters import Counters
from app.stats.service import StatsService
from app.wall.models import Note, NoteColor, NoteStatus
from app.wall.placement import WallGeometry
from app.wall.repository import NoteRepository
from app.wall.schemas import (
    NoteCreate,
    NoteOwned,
    NotePublic,
    NoteUpdate,
    TileDetail,
    TileSummary,
    WallManifest,
)

_MAX_PLACEMENT_ATTEMPTS = 8


class WallService:
    """Orchestrates the wall: one active note per founder, server placement."""

    def __init__(
        self,
        *,
        session: AsyncSession,
        repository: NoteRepository,
        geometry: WallGeometry,
        screener: ContentScreener,
        counters: Counters,
        event_bus: EventBus,
        stats: StatsService,
    ) -> None:
        self._session = session
        self._repo = repository
        self._geometry = geometry
        self._screener = screener
        self._counters = counters
        self._events = event_bus
        self._stats = stats

    # --- Commands --------------------------------------------------------
    async def create_note(self, user_id: uuid.UUID, data: NoteCreate) -> NotePublic:
        result = self._screener.screen(data.content)
        if not result.allowed:
            raise ValidationError("Note rejected by content policy", code="content_rejected")

        if await self._repo.get_active_for_user(user_id) is not None:
            raise ConflictError(
                "You already have an active note; edit or remove it first",
                code="note_exists",
            )

        note = await self._place_note(user_id, data)
        await self._counters.increment_thoughts()
        await self._broadcast_note(EventType.NOTE_CREATED, note)
        await self._broadcast_counters()
        return NotePublic.model_validate(note)

    async def update_note(
        self, user_id: uuid.UUID, note_id: uuid.UUID, data: NoteUpdate
    ) -> NoteOwned:
        note = await self._owned_active_note(user_id, note_id)
        if data.content is not None:
            screen = self._screener.screen(data.content)
            if not screen.allowed:
                raise ValidationError("Note rejected by content policy", code="content_rejected")
            note.content = data.content
        if data.color is not None:
            note.color = data.color
        await self._session.flush()
        await self._session.refresh(note)  # Refresh the server-side updated_at.
        await self._broadcast_note(EventType.NOTE_UPDATED, note)
        return NoteOwned.model_validate(note)

    async def delete_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> None:
        note = await self._owned_active_note(user_id, note_id)
        await self._retire(note)

    async def remove_note(self, note_id: uuid.UUID) -> None:
        """Moderator/system removal — no ownership check."""
        note = await self._repo.get(note_id)
        if note is None or note.status != NoteStatus.ACTIVE:
            raise NotFoundError("Active note not found")
        await self._retire(note)

    # --- Queries ---------------------------------------------------------
    async def get_my_note(self, user_id: uuid.UUID) -> NoteOwned | None:
        note = await self._repo.get_active_for_user(user_id)
        return NoteOwned.model_validate(note) if note is not None else None

    async def get_manifest(self) -> WallManifest:
        counts = await self._repo.count_active_per_tile()
        total_notes = sum(counts.values())
        tiles: list[TileSummary] = []
        for tile_id in range(self._geometry.total_tiles):
            bounds = self._geometry.tile_bounds(tile_id)
            tiles.append(
                TileSummary(
                    tile_id=tile_id,
                    col=bounds.col,
                    row=bounds.row,
                    x0=bounds.x0,
                    y0=bounds.y0,
                    width=bounds.x1 - bounds.x0,
                    height=bounds.y1 - bounds.y0,
                    note_count=counts.get(tile_id, 0),
                )
            )
        return WallManifest(
            columns=self._geometry.columns,
            rows=self._geometry.rows,
            tile_size=self._geometry.tile_size,
            tiles_across=self._geometry.tiles_across,
            tiles_down=self._geometry.tiles_down,
            total_tiles=self._geometry.total_tiles,
            total_notes=total_notes,
            tiles=tiles,
        )

    async def get_tile(self, tile_id: int) -> TileDetail:
        # Validates range and raises ConflictError for out-of-range ids.
        self._geometry.tile_bounds(tile_id)
        notes = await self._repo.list_by_tile(tile_id)
        return TileDetail(
            tile_id=tile_id,
            notes=[NotePublic.model_validate(note) for note in notes],
        )

    # --- Internals -------------------------------------------------------
    async def _place_note(self, user_id: uuid.UUID, data: NoteCreate) -> Note:
        last_error: IntegrityError | None = None
        for _ in range(_MAX_PLACEMENT_ATTEMPTS):
            occupied = await self._repo.occupied_cells()
            cell = self._geometry.first_free_cell(occupied)
            note = Note(
                user_id=user_id,
                content=data.content,
                color=data.color or NoteColor.AMBER,
                status=NoteStatus.ACTIVE,
                x=cell.x,
                y=cell.y,
                tile_id=self._geometry.tile_for(cell.x, cell.y),
            )
            try:
                async with self._session.begin_nested():
                    self._session.add(note)
                    await self._session.flush()
                # Load server-generated defaults (timestamps) before serializing.
                await self._session.refresh(note)
                return note
            except IntegrityError as exc:
                # Two integrity failures are possible under concurrency:
                #  1. the per-user active-note unique index — the founder raced
                #     themselves; surface a clean 409 rather than retrying.
                #  2. the cell unique constraint — another founder took the
                #     cell; pick a new free cell and retry.
                last_error = exc
                if await self._repo.get_active_for_user(user_id) is not None:
                    raise ConflictError(
                        "You already have an active note; edit or remove it first",
                        code="note_exists",
                    ) from exc
        raise ConflictError("Could not place note; please retry") from last_error

    async def _retire(self, note: Note) -> None:
        note.status = NoteStatus.REMOVED
        note.x = None
        note.y = None
        note.tile_id = None
        await self._session.flush()
        await self._events.publish(
            WallEvent(type=EventType.NOTE_DELETED, payload={"id": str(note.id)})
        )
        await self._broadcast_counters()

    async def _owned_active_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> Note:
        note = await self._repo.get(note_id)
        if note is None or note.status != NoteStatus.ACTIVE:
            raise NotFoundError("Active note not found")
        if note.user_id != user_id:
            raise NotFoundError("Active note not found")
        return note

    async def _broadcast_note(self, event_type: EventType, note: Note) -> None:
        await self._events.publish(
            WallEvent(
                type=event_type,
                payload=NotePublic.model_validate(note).model_dump(mode="json"),
            )
        )

    async def _broadcast_counters(self) -> None:
        snapshot = await self._stats.snapshot()
        await self._events.publish(
            WallEvent(
                type=EventType.COUNTERS_UPDATED,
                payload=snapshot.model_dump(mode="json"),
            )
        )
