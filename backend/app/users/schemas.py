"""User schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserPublic(BaseModel):
    """Anonymous, public projection of a founder."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    handle: str


class UserProfile(BaseModel):
    """Private profile returned to the authenticated user themselves."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    handle: str
    display_name: str | None
    avatar_url: str | None
    is_moderator: bool
    created_at: datetime


class GoogleIdentity(BaseModel):
    """Verified claims extracted from a Google ID token."""

    sub: str
    email: EmailStr
    name: str | None = None
    picture: str | None = None
