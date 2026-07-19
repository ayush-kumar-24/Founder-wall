"""Data access for users."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User


class UserRepository:
    """Encapsulates all persistence for :class:`User`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        result = await self._session.execute(select(User).where(User.google_sub == google_sub))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def handle_exists(self, handle: str) -> bool:
        result = await self._session.execute(select(User.id).where(User.handle == handle))
        return result.first() is not None

    async def add(self, user: User) -> User:
        self._session.add(user)
        await self._session.flush()
        return user

    async def count(self) -> int:
        from sqlalchemy import func

        result = await self._session.execute(select(func.count()).select_from(User))
        return int(result.scalar_one())
