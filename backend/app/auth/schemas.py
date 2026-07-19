"""Auth request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GoogleAuthRequest(BaseModel):
    """Body for POST /auth/google — the Google ID token from the frontend."""

    credential: str = Field(min_length=1, description="Google ID token (JWT)")


class RefreshRequest(BaseModel):
    """Body for POST /auth/refresh."""

    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
