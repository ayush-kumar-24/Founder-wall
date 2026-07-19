"""Auth HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.auth.dependencies import AuthServiceDep, CurrentUser
from app.auth.schemas import GoogleAuthRequest, RefreshRequest, TokenResponse
from app.shared.dependencies import SettingsDep, rate_limit
from app.users.schemas import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Exchange a Google ID token for an application session",
    dependencies=[rate_limit(per_minute=30)],
)
async def google_login(
    body: GoogleAuthRequest,
    auth_service: AuthServiceDep,
    settings: SettingsDep,
) -> TokenResponse:
    _, pair = await auth_service.login_with_google(body.credential)
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=settings.access_token_ttl_seconds,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate a refresh token for a new session",
    dependencies=[rate_limit(per_minute=60)],
)
async def refresh(
    body: RefreshRequest,
    auth_service: AuthServiceDep,
    settings: SettingsDep,
) -> TokenResponse:
    pair = await auth_service.refresh(body.refresh_token)
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=settings.access_token_ttl_seconds,
    )


@router.get("/me", response_model=UserProfile, summary="Current authenticated founder")
async def me(user: CurrentUser) -> UserProfile:
    return UserProfile.model_validate(user)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Revoke a refresh token",
)
async def logout(
    body: RefreshRequest,
    auth_service: AuthServiceDep,
) -> dict[str, bool]:
    await auth_service.logout(body.refresh_token)
    return {"success": True}
