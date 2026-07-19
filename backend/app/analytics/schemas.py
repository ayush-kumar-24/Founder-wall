"""Analytics schemas."""

from __future__ import annotations

from pydantic import BaseModel


class RecentEvent(BaseModel):
    id: str
    type: str


class AnalyticsOverview(BaseModel):
    stream_length: int
    sampled_events: int
    event_counts: dict[str, int]
    recent: list[RecentEvent]
