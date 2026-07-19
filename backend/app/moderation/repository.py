"""Data access for moderation reports."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.moderation.models import ModerationReport, ReportStatus
from app.wall.models import Note


class ModerationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, report: ModerationReport) -> ModerationReport:
        self._session.add(report)
        await self._session.flush()
        # Load server-generated defaults (timestamps, status) before returning.
        await self._session.refresh(report)
        return report

    async def get(self, report_id: uuid.UUID) -> ModerationReport | None:
        return await self._session.get(ModerationReport, report_id)

    async def open_report_exists(self, note_id: uuid.UUID, reporter_id: uuid.UUID | None) -> bool:
        stmt = select(ModerationReport.id).where(
            ModerationReport.note_id == note_id,
            ModerationReport.status == ReportStatus.OPEN,
        )
        if reporter_id is not None:
            stmt = stmt.where(ModerationReport.reporter_id == reporter_id)
        result = await self._session.execute(stmt)
        return result.first() is not None

    async def list_open(self, limit: int = 100) -> list[tuple[ModerationReport, Note]]:
        result = await self._session.execute(
            select(ModerationReport, Note)
            .join(Note, Note.id == ModerationReport.note_id)
            .where(ModerationReport.status == ReportStatus.OPEN)
            .order_by(ModerationReport.created_at)
            .limit(limit)
        )
        return [(report, note) for report, note in result.all()]

    async def count_open(self) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(ModerationReport)
            .where(ModerationReport.status == ReportStatus.OPEN)
        )
        return int(result.scalar_one())
