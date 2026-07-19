"""Analytics over the durable Redis event stream."""

from __future__ import annotations

from collections import Counter
from typing import cast

from redis.asyncio import Redis

from app.analytics.schemas import AnalyticsOverview, RecentEvent
from app.realtime.schemas import WallEvent
from app.shared.config import Settings


class AnalyticsService:
    """Derives activity metrics by sampling the bounded event stream."""

    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._redis = redis
        self._stream = settings.wall_events_stream

    async def overview(self, sample: int = 500) -> AnalyticsOverview:
        length = int(await self._redis.xlen(self._stream))
        raw_entries = await self._redis.xrevrange(self._stream, count=sample)
        # redis-py types this loosely; normalise to concrete (id, fields) tuples.
        entries = cast(list[tuple[str, dict[str, str]]], raw_entries or [])

        counts: Counter[str] = Counter()
        recent: list[RecentEvent] = []
        for entry_id, fields in entries:
            raw = fields.get("event")
            if not raw:
                continue
            try:
                event = WallEvent.decode(raw)
            except ValueError:
                continue
            event_type = str(event.type)
            counts[event_type] += 1
            if len(recent) < 25:
                recent.append(RecentEvent(id=str(entry_id), type=event_type))

        return AnalyticsOverview(
            stream_length=length,
            sampled_events=len(entries),
            event_counts=dict(counts),
            recent=recent,
        )
