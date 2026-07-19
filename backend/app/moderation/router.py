"""Moderation HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.auth.dependencies import CurrentModerator, CurrentUser
from app.moderation.dependencies import ModerationServiceDep
from app.moderation.schemas import (
    ReportCreate,
    ReportedNoteView,
    ReportResolve,
    ReportView,
)
from app.shared.dependencies import rate_limit

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post(
    "/notes/{note_id}/report",
    response_model=ReportView,
    status_code=status.HTTP_201_CREATED,
    summary="Report a note for review",
    dependencies=[rate_limit(per_minute=20)],
)
async def report_note(
    note_id: uuid.UUID,
    body: ReportCreate,
    user: CurrentUser,
    service: ModerationServiceDep,
) -> ReportView:
    return await service.report(note_id, user.id, body)


@router.get(
    "/queue",
    response_model=list[ReportedNoteView],
    summary="Open moderation queue (moderators only)",
)
async def queue(_: CurrentModerator, service: ModerationServiceDep) -> list[ReportedNoteView]:
    return await service.queue()


@router.post(
    "/reports/{report_id}/resolve",
    response_model=ReportView,
    summary="Resolve a report (moderators only)",
)
async def resolve(
    report_id: uuid.UUID,
    body: ReportResolve,
    moderator: CurrentModerator,
    service: ModerationServiceDep,
) -> ReportView:
    return await service.resolve(report_id, moderator.id, body)
