"""Wire schemas for realtime events broadcast over WebSockets and Redis."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EventType(StrEnum):
    NOTE_CREATED = "note.created"
    NOTE_UPDATED = "note.updated"
    NOTE_DELETED = "note.deleted"
    COUNTERS_UPDATED = "counters.updated"
    PRESENCE_UPDATED = "presence.updated"
    MODERATION_UPDATED = "moderation.updated"


class WallEvent(BaseModel):
    """An event fanned out to every connected client."""

    model_config = ConfigDict(use_enum_values=True)

    type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)

    def encode(self) -> str:
        return self.model_dump_json()

    @classmethod
    def decode(cls, raw: str) -> WallEvent:
        return cls.model_validate_json(raw)


class ClientMessage(BaseModel):
    """A message received from a WebSocket client."""

    action: str
    data: dict[str, Any] = Field(default_factory=dict)
