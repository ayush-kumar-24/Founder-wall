"""Wall module dependency wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.moderation.screener import ContentScreener
from app.shared.container import Container
from app.shared.dependencies import (
    EventBusDep,
    SessionDep,
    SettingsDep,
    get_container,
)
from app.stats.counters import Counters
from app.stats.service import StatsService
from app.users.repository import UserRepository
from app.wall.placement import WallGeometry
from app.wall.repository import NoteRepository
from app.wall.service import WallService


def get_note_repository(session: SessionDep) -> NoteRepository:
    return NoteRepository(session)


NoteRepositoryDep = Annotated[NoteRepository, Depends(get_note_repository)]


def get_geometry(settings: SettingsDep) -> WallGeometry:
    return WallGeometry(settings)


def get_screener() -> ContentScreener:
    return ContentScreener()


def get_wall_service(
    session: SessionDep,
    settings: SettingsDep,
    container: Annotated[Container, Depends(get_container)],
    repository: NoteRepositoryDep,
    geometry: Annotated[WallGeometry, Depends(get_geometry)],
    screener: Annotated[ContentScreener, Depends(get_screener)],
    event_bus: EventBusDep,
) -> WallService:
    counters = Counters(container.redis.client)
    stats = StatsService(
        settings=settings,
        counters=counters,
        event_bus=event_bus,
        user_repository=UserRepository(session),
        note_repository=repository,
    )
    return WallService(
        session=session,
        repository=repository,
        geometry=geometry,
        screener=screener,
        counters=counters,
        event_bus=event_bus,
        stats=stats,
    )


WallGeometryDep = Annotated[WallGeometry, Depends(get_geometry)]
WallServiceDep = Annotated[WallService, Depends(get_wall_service)]
