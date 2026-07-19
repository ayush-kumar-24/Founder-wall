"""User domain logic: provisioning founders from a verified Google identity."""

from __future__ import annotations

import uuid

from app.shared.exceptions import NotFoundError
from app.shared.security import new_anonymous_handle
from app.users.models import User
from app.users.repository import UserRepository
from app.users.schemas import GoogleIdentity


class UserService:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self._repository.get(user_id)
        if user is None or not user.is_active:
            raise NotFoundError("User not found")
        return user

    async def get_or_create_from_google(self, identity: GoogleIdentity) -> User:
        """Idempotently provision a founder from verified Google claims."""
        existing = await self._repository.get_by_google_sub(identity.sub)
        if existing is not None:
            return existing

        # A pre-existing account with the same email (e.g. migrated) is reused.
        by_email = await self._repository.get_by_email(identity.email)
        if by_email is not None:
            by_email.google_sub = identity.sub
            return by_email

        user = User(
            google_sub=identity.sub,
            email=identity.email,
            handle=await self._unique_handle(),
            display_name=identity.name,
            avatar_url=identity.picture,
        )
        return await self._repository.add(user)

    async def _unique_handle(self) -> str:
        for _ in range(10):
            candidate = new_anonymous_handle()
            if not await self._repository.handle_exists(candidate):
                return candidate
        # Astronomically unlikely; fall back to a UUID-suffixed handle.
        return f"founder-{uuid.uuid4().hex[:12]}"

    async def founder_count(self) -> int:
        return await self._repository.count()
