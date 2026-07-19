"""JWT issuance/verification and token hashing helpers."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from jose import JWTError, jwt

from app.shared.config import Settings
from app.shared.exceptions import AuthenticationError

TokenType = Literal["access", "refresh"]


@dataclass(frozen=True, slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@dataclass(frozen=True, slots=True)
class TokenClaims:
    subject: uuid.UUID
    token_type: TokenType
    jti: str
    expires_at: datetime


class TokenService:
    """Encodes and decodes signed JWTs for access and refresh tokens."""

    def __init__(self, settings: Settings) -> None:
        self._secret = settings.jwt_secret
        self._algorithm = settings.jwt_algorithm
        self._access_ttl = settings.access_token_ttl_seconds
        self._refresh_ttl = settings.refresh_token_ttl_seconds

    def _encode(self, subject: uuid.UUID, token_type: TokenType, ttl: int) -> tuple[str, str]:
        now = datetime.now(UTC)
        jti = uuid.uuid4().hex
        payload = {
            "sub": str(subject),
            "type": token_type,
            "jti": jti,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        }
        token = jwt.encode(payload, self._secret, algorithm=self._algorithm)
        return token, jti

    def create_access_token(self, subject: uuid.UUID) -> str:
        token, _ = self._encode(subject, "access", self._access_ttl)
        return token

    def create_refresh_token(self, subject: uuid.UUID) -> tuple[str, str]:
        """Return (token, jti). The jti anchors server-side revocation."""
        return self._encode(subject, "refresh", self._refresh_ttl)

    def decode(self, token: str, *, expected_type: TokenType) -> TokenClaims:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except JWTError as exc:
            raise AuthenticationError("Invalid or expired token") from exc

        if payload.get("type") != expected_type:
            raise AuthenticationError(f"Expected a {expected_type} token")
        try:
            subject = uuid.UUID(payload["sub"])
        except (KeyError, ValueError) as exc:
            raise AuthenticationError("Malformed token subject") from exc

        return TokenClaims(
            subject=subject,
            token_type=expected_type,
            jti=str(payload.get("jti", "")),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )


def hash_token(token: str, *, secret: str) -> str:
    """Keyed hash for storing refresh-token references at rest."""
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def constant_time_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def new_anonymous_handle() -> str:
    """Generate an opaque, human-readable anonymous founder handle."""
    return f"founder-{secrets.token_hex(4)}"
