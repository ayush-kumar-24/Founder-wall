"""Analytics module dependency wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.analytics.service import AnalyticsService
from app.shared.container import Container
from app.shared.dependencies import get_container


def get_analytics_service(
    container: Annotated[Container, Depends(get_container)],
) -> AnalyticsService:
    return AnalyticsService(container.redis.client, container.settings)


AnalyticsServiceDep = Annotated[AnalyticsService, Depends(get_analytics_service)]
