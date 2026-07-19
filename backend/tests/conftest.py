"""Shared pytest fixtures: hermetic app backed by SQLite + fakeredis."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import fakeredis.aioredis as fakeaioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import update

import app.models  # noqa: F401 - registers all ORM models on Base.metadata
from app.main import create_app
from app.shared.config import Settings
from app.shared.container import Container
from app.shared.database import Base
from app.users.models import User


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        redis_url="redis://localhost:6379/0",
        jwt_secret="test-secret-value-please-change",
        google_allow_insecure_tokens=True,
        rate_limit_enabled=False,
        log_json=False,
        cors_origins=["*"],
    )


@pytest_asyncio.fixture
async def container(settings: Settings, monkeypatch) -> AsyncIterator[Container]:
    fake = fakeaioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("app.shared.redis.from_url", lambda *args, **kwargs: fake)
    instance = Container(settings)
    async with instance.database.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await instance.event_bus.start()
    try:
        yield instance
    finally:
        await instance.shutdown()


@pytest_asyncio.fixture
async def client(settings: Settings, container: Container) -> AsyncIterator[AsyncClient]:
    application = create_app(settings)
    application.state.container = container
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


def google_credential(
    *, sub: str = "google-sub-1", email: str = "founder@example.com", name: str = "Ada"
) -> str:
    """Craft an unsigned Google-style ID token (accepted in insecure test mode)."""
    return jwt.encode(
        {"sub": sub, "email": email, "name": name, "email_verified": True},
        "unused",
        algorithm="HS256",
    )


async def authenticate(
    client: AsyncClient, *, sub: str = "google-sub-1", email: str = "founder@example.com"
) -> dict[str, str]:
    """Log in via Google and return access/refresh tokens."""
    response = await client.post(
        "/auth/google", json={"credential": google_credential(sub=sub, email=email)}
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_header(tokens: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def promote_to_moderator(container: Container, email: str) -> uuid.UUID:
    async for session in container.database.session():
        await session.execute(update(User).where(User.email == email).values(is_moderator=True))
    async for session in container.database.session():
        from sqlalchemy import select

        result = await session.execute(select(User.id).where(User.email == email))
        return uuid.UUID(str(result.scalar_one()))
