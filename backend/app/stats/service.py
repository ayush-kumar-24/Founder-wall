"""Aggregates live counters into a single snapshot."""

from __future__ import annotations

from app.realtime.pubsub import EventBus
from app.shared.config import Settings
from app.stats.counters import Counters
from app.stats.schemas import StatsSnapshot
from app.users.repository import UserRepository
from app.wall.repository import NoteRepository


class StatsService:
    """Reads the founder, thought, note, and presence counters."""

    def __init__(
        self,
        *,
        settings: Settings,
        counters: Counters,
        event_bus: EventBus,
        user_repository: UserRepository,
        note_repository: NoteRepository,
    ) -> None:
        self._settings = settings
        self._counters = counters
        self._event_bus = event_bus
        self._users = user_repository
        self._notes = note_repository

    async def snapshot(self) -> StatsSnapshot:
        founders = await self._users.count()
        active_notes = await self._notes.count_active()
        # Keep the fast Redis counter in step with reality on first read.
        await self._counters.reconcile_thoughts(active_notes)
        thoughts = await self._counters.thoughts()
        online = await self._event_bus.online_count()
        return StatsSnapshot(
            founders=founders,
            thoughts=thoughts,
            active_notes=active_notes,
            online=online,
            wall_capacity=self._settings.wall_total_cells,
        )
