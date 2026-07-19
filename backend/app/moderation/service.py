"""Moderation domain logic: reporting notes and working the queue."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.moderation.models import ModerationReport, ReportStatus
from app.moderation.repository import ModerationRepository
from app.moderation.schemas import (
    ReportCreate,
    ReportedNoteView,
    ReportResolve,
    ReportView,
    ResolutionAction,
)
from app.realtime.pubsub import EventBus
from app.realtime.schemas import EventType, WallEvent
from app.shared.exceptions import ConflictError, NotFoundError
from app.wall.repository import NoteRepository
from app.wall.service import WallService


class ModerationService:
    def __init__(
        self,
        *,
        repository: ModerationRepository,
        note_repository: NoteRepository,
        wall_service: WallService,
        event_bus: EventBus,
    ) -> None:
        self._repo = repository
        self._notes = note_repository
        self._wall = wall_service
        self._events = event_bus

    async def report(
        self,
        note_id: uuid.UUID,
        reporter_id: uuid.UUID | None,
        data: ReportCreate,
    ) -> ReportView:
        note = await self._notes.get(note_id)
        if note is None:
            raise NotFoundError("Note not found")
        if await self._repo.open_report_exists(note_id, reporter_id):
            raise ConflictError("You have already reported this note")

        report = await self._repo.add(
            ModerationReport(
                note_id=note_id,
                reporter_id=reporter_id,
                reason=data.reason,
                detail=data.detail,
            )
        )
        await self._events.publish(
            WallEvent(
                type=EventType.MODERATION_UPDATED,
                payload={"open_reports": await self._repo.count_open()},
            )
        )
        return ReportView.model_validate(report)

    async def queue(self) -> list[ReportedNoteView]:
        entries = await self._repo.list_open()
        return [
            ReportedNoteView(
                report=ReportView.model_validate(report),
                note_content=note.content,
                note_status=note.status.value,
            )
            for report, note in entries
        ]

    async def resolve(
        self,
        report_id: uuid.UUID,
        moderator_id: uuid.UUID,
        data: ReportResolve,
    ) -> ReportView:
        report = await self._repo.get(report_id)
        if report is None:
            raise NotFoundError("Report not found")
        if report.status != ReportStatus.OPEN:
            raise ConflictError("Report has already been handled")

        if data.action is ResolutionAction.REMOVE:
            await self._wall.remove_note(report.note_id)
            report.status = ReportStatus.RESOLVED
        else:
            report.status = ReportStatus.DISMISSED

        report.resolution = data.note
        report.resolved_by = moderator_id
        report.updated_at = datetime.now(UTC)

        await self._events.publish(
            WallEvent(
                type=EventType.MODERATION_UPDATED,
                payload={"open_reports": await self._repo.count_open()},
            )
        )
        return ReportView.model_validate(report)
