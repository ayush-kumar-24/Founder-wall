"""Users module dependency wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.shared.dependencies import SessionDep
from app.users.repository import UserRepository
from app.users.service import UserService


def get_user_repository(session: SessionDep) -> UserRepository:
    return UserRepository(session)


def get_user_service(
    repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> UserService:
    return UserService(repository)


UserRepositoryDep = Annotated[UserRepository, Depends(get_user_repository)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
