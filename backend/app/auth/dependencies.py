"""Auth dependency wiring: current-user resolution and service assembly."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.google import GoogleTokenVerifier
from app.auth.repository import RefreshTokenRepository
from app.auth.service import AuthService
from app.shared.container import Container
from app.shared.dependencies import (
    SessionDep,
    SettingsDep,
    TokenServiceDep,
    get_container,
)
from app.shared.exceptions import AuthenticationError, AuthorizationError
from app.users.dependencies import UserServiceDep
from app.users.models import User

_bearer = HTTPBearer(auto_error=False)


def get_refresh_repository(session: SessionDep) -> RefreshTokenRepository:
    return RefreshTokenRepository(session)


def get_google_verifier(
    container: Annotated[Container, Depends(get_container)],
) -> GoogleTokenVerifier:
    return container.google_verifier


def get_auth_service(
    settings: SettingsDep,
    verifier: Annotated[GoogleTokenVerifier, Depends(get_google_verifier)],
    user_service: UserServiceDep,
    token_service: TokenServiceDep,
    refresh_repository: Annotated[RefreshTokenRepository, Depends(get_refresh_repository)],
) -> AuthService:
    return AuthService(
        settings=settings,
        verifier=verifier,
        user_service=user_service,
        token_service=token_service,
        refresh_repository=refresh_repository,
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    token_service: TokenServiceDep,
    user_service: UserServiceDep,
) -> User:
    if credentials is None:
        raise AuthenticationError("Missing bearer token")
    claims = token_service.decode(credentials.credentials, expected_type="access")
    try:
        return await user_service.get(claims.subject)
    except Exception as exc:  # NotFoundError -> 401 in the auth context
        raise AuthenticationError("User not found or inactive") from exc


async def get_current_moderator(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_moderator:
        raise AuthorizationError("Moderator privileges required")
    return user


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentModerator = Annotated[User, Depends(get_current_moderator)]
