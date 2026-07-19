"""Moderation schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.moderation.models import ReportReason, ReportStatus


class ReportCreate(BaseModel):
    reason: ReportReason
    detail: str | None = Field(default=None, max_length=512)


class ReportView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    note_id: uuid.UUID
    reason: ReportReason
    detail: str | None
    status: ReportStatus
    created_at: datetime


class ReportedNoteView(BaseModel):
    """A queue entry pairing the report with the offending note content."""

    report: ReportView
    note_content: str
    note_status: str


class ResolutionAction(StrEnum):
    REMOVE = "remove"
    DISMISS = "dismiss"


class ReportResolve(BaseModel):
    action: ResolutionAction
    note: str | None = Field(default=None, max_length=512)
