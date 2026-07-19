"""Google ID-token verification.

The frontend performs Google Sign-In and posts the resulting ID token (a
signed JWT) to ``/auth/google``. This module verifies that token's signature
against Google's published JWKS and validates its issuer/audience/expiry.
"""

from __future__ import annotations

import time

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.shared.config import Settings
from app.shared.exceptions import AuthenticationError
from app.shared.logging import get_logger
from app.users.schemas import GoogleIdentity

logger = get_logger(__name__)

_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_VALID_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}


class GoogleTokenVerifier:
    """Verifies Google ID tokens, caching Google's signing keys in memory."""

    def __init__(self, settings: Settings, *, http_client: httpx.AsyncClient | None = None):
        self._settings = settings
        self._client = http_client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = http_client is None
        self._jwks: dict[str, object] | None = None
        self._jwks_expires_at: float = 0.0

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _get_jwks(self) -> dict[str, object]:
        now = time.time()
        if self._jwks is not None and now < self._jwks_expires_at:
            return self._jwks
        response = await self._client.get(_GOOGLE_CERTS_URL)
        response.raise_for_status()
        self._jwks = response.json()
        # Respect Cache-Control max-age when present; default to 1 hour.
        max_age = _parse_max_age(response.headers.get("cache-control", ""))
        self._jwks_expires_at = now + max_age
        return self._jwks

    async def verify(self, id_token: str) -> GoogleIdentity:
        """Verify a Google ID token and return the trusted identity claims."""
        if self._settings.google_allow_insecure_tokens:
            try:
                claims = jwt.get_unverified_claims(id_token)
            except JWTError as exc:
                raise AuthenticationError("Invalid Google credential") from exc
            return self._to_identity(claims)

        if not self._settings.google_client_id:
            raise AuthenticationError("Google login is not configured")

        try:
            jwks = await self._get_jwks()
            claims = jwt.decode(
                id_token,
                jwks,
                algorithms=["RS256"],
                audience=self._settings.google_client_id,
                options={"verify_at_hash": False},
            )
        except (JWTError, httpx.HTTPError) as exc:
            logger.warning("google_token_verification_failed", error=str(exc))
            raise AuthenticationError("Invalid Google credential") from exc

        if claims.get("iss") not in _VALID_ISSUERS:
            raise AuthenticationError("Untrusted token issuer")
        if claims.get("email_verified") is False:
            raise AuthenticationError("Google email is not verified")
        return self._to_identity(claims)

    @staticmethod
    def _to_identity(claims: dict[str, object]) -> GoogleIdentity:
        sub = claims.get("sub")
        email = claims.get("email")
        if not sub or not email:
            raise AuthenticationError("Google token is missing required claims")
        return GoogleIdentity(
            sub=str(sub),
            email=str(email),
            name=_opt_str(claims.get("name")),
            picture=_opt_str(claims.get("picture")),
        )


def _opt_str(value: object) -> str | None:
    return str(value) if value is not None else None


def _parse_max_age(cache_control: str, *, default: int = 3600) -> int:
    for part in cache_control.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                return int(part.split("=", 1)[1])
            except ValueError:
                return default
    return default
