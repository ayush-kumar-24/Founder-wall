"""Moderation module dependency wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.moderation.repository import ModerationRepository
from app.moderation.service import ModerationService
from app.shared.dependencies import EventBusDep, SessionDep
from app.wall.dependencies import NoteRepositoryDep, WallServiceDep


def get_moderation_repository(session: SessionDep) -> ModerationRepository:
    return ModerationRepository(session)


def get_moderation_service(
    repository: Annotated[ModerationRepository, Depends(get_moderation_repository)],
    note_repository: NoteRepositoryDep,
    wall_service: WallServiceDep,
    event_bus: EventBusDep,
) -> ModerationService:
    return ModerationService(
        repository=repository,
        note_repository=note_repository,
        wall_service=wall_service,
        event_bus=event_bus,
    )


ModerationServiceDep = Annotated[ModerationService, Depends(get_moderation_service)]
