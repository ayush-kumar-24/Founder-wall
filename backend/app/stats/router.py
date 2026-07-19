"""Stats HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.stats.dependencies import StatsServiceDep
from app.stats.schemas import StatsSnapshot

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsSnapshot, summary="Live monument counters")
async def stats(service: StatsServiceDep) -> StatsSnapshot:
    return await service.snapshot()
