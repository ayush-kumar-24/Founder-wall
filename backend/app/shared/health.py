"""Health and readiness probes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.shared.container import Container
from app.shared.dependencies import get_container

router = APIRouter(tags=["health"])


class HealthStatus(BaseModel):
    status: str
    version: str
    checks: dict[str, str]


async def _check_database(container: Container) -> str:
    try:
        async for session in container.database.session():
            await session.execute(text("SELECT 1"))
        return "ok"
    except Exception:  # noqa: BLE001 - report degraded, don't propagate
        return "error"


async def _check_redis(container: Container) -> str:
    try:
        return "ok" if await container.redis.ping() else "error"
    except Exception:  # noqa: BLE001
        return "error"


@router.get("/health", response_model=HealthStatus, summary="Liveness + dependency health")
async def health(
    response: Response,
    container: Annotated[Container, Depends(get_container)],
) -> HealthStatus:
    from app import __version__

    checks = {
        "database": await _check_database(container),
        "redis": await _check_redis(container),
    }
    healthy = all(value == "ok" for value in checks.values())
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthStatus(
        status="ok" if healthy else "degraded",
        version=__version__,
        checks=checks,
    )


@router.get("/health/live", summary="Process liveness only")
async def live() -> dict[str, str]:
    return {"status": "ok"}
