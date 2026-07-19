"""Stats module dependency wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.shared.container import Container
from app.shared.dependencies import EventBusDep, SettingsDep, get_container
from app.stats.counters import Counters
from app.stats.service import StatsService
from app.users.dependencies import UserRepositoryDep
from app.wall.dependencies import NoteRepositoryDep


def get_counters(container: Annotated[Container, Depends(get_container)]) -> Counters:
    return Counters(container.redis.client)


def get_stats_service(
    settings: SettingsDep,
    counters: Annotated[Counters, Depends(get_counters)],
    event_bus: EventBusDep,
    user_repository: UserRepositoryDep,
    note_repository: NoteRepositoryDep,
) -> StatsService:
    return StatsService(
        settings=settings,
        counters=counters,
        event_bus=event_bus,
        user_repository=user_repository,
        note_repository=note_repository,
    )


CountersDep = Annotated[Counters, Depends(get_counters)]
StatsServiceDep = Annotated[StatsService, Depends(get_stats_service)]
