"""Authentication orchestration: login, refresh rotation, logout."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.auth.google import GoogleTokenVerifier
from app.auth.models import RefreshToken
from app.auth.repository import RefreshTokenRepository
from app.shared.config import Settings
from app.shared.exceptions import AuthenticationError
from app.shared.security import (
    TokenPair,
    TokenService,
    constant_time_compare,
    hash_token,
)
from app.users.models import User
from app.users.service import UserService


class AuthService:
    """Coordinates identity verification and JWT session lifecycle."""

    def __init__(
        self,
        *,
        settings: Settings,
        verifier: GoogleTokenVerifier,
        user_service: UserService,
        token_service: TokenService,
        refresh_repository: RefreshTokenRepository,
    ) -> None:
        self._settings = settings
        self._verifier = verifier
        self._users = user_service
        self._tokens = token_service
        self._refresh_repo = refresh_repository

    async def login_with_google(self, credential: str) -> tuple[User, TokenPair]:
        identity = await self._verifier.verify(credential)
        user = await self._users.get_or_create_from_google(identity)
        if not user.is_active:
            raise AuthenticationError("Account is disabled")
        pair = await self._issue_pair(user)
        return user, pair

    async def refresh(self, refresh_token: str) -> TokenPair:
        claims = self._tokens.decode(refresh_token, expected_type="refresh")
        record = await self._refresh_repo.get_by_jti(claims.jti)
        if record is None:
            raise AuthenticationError("Refresh token is no longer valid")
        if record.revoked_at is not None:
            # Replay of an already-rotated token. Either this is a stale retry
            # or a stolen token being used alongside the legitimate one; we
            # cannot tell them apart, so we assume theft and invalidate every
            # session for the account (OAuth 2.0 Security BCP, replay
            # detection). The real owner simply signs in again.
            await self._refresh_repo.revoke_all_for_user(record.user_id)
            raise AuthenticationError("Refresh token is no longer valid")
        # Some backends (e.g. SQLite) return naive datetimes; treat them as UTC.
        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            raise AuthenticationError("Refresh token has expired")
        expected_hash = hash_token(refresh_token, secret=self._settings.jwt_secret)
        if not constant_time_compare(record.token_hash, expected_hash):
            # Token tampering — revoke the whole family defensively.
            await self._refresh_repo.revoke_all_for_user(record.user_id)
            raise AuthenticationError("Refresh token mismatch")

        # Rotate: revoke the presented token, issue a fresh pair.
        await self._refresh_repo.revoke(record.jti)
        user = await self._users.get(record.user_id)
        return await self._issue_pair(user)

    async def logout(self, refresh_token: str) -> None:
        try:
            claims = self._tokens.decode(refresh_token, expected_type="refresh")
        except AuthenticationError:
            return  # Idempotent: an invalid token is already "logged out".
        await self._refresh_repo.revoke(claims.jti)

    async def _issue_pair(self, user: User) -> TokenPair:
        access = self._tokens.create_access_token(user.id)
        refresh, jti = self._tokens.create_refresh_token(user.id)
        expires_at = datetime.now(UTC) + timedelta(seconds=self._settings.refresh_token_ttl_seconds)
        await self._refresh_repo.add(
            RefreshToken(
                user_id=user.id,
                jti=jti,
                token_hash=hash_token(refresh, secret=self._settings.jwt_secret),
                expires_at=expires_at,
            )
        )
        return TokenPair(access_token=access, refresh_token=refresh)
