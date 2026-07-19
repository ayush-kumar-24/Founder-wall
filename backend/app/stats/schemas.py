"""Stats schemas."""

from __future__ import annotations

from pydantic import BaseModel


class StatsSnapshot(BaseModel):
    """The live figures rendered on the monument."""

    founders: int
    thoughts: int
    active_notes: int
    online: int
    wall_capacity: int
