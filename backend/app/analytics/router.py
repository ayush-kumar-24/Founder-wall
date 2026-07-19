"""Analytics HTTP routes (moderators only)."""

from __future__ import annotations

from fastapi import APIRouter

from app.analytics.dependencies import AnalyticsServiceDep
from app.analytics.schemas import AnalyticsOverview
from app.auth.dependencies import CurrentModerator

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview, summary="Activity overview")
async def overview(_: CurrentModerator, service: AnalyticsServiceDep) -> AnalyticsOverview:
    return await service.overview()
