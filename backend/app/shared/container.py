"""Composition root: owns application-lifetime singletons."""

from __future__ import annotations

from app.auth.google import GoogleTokenVerifier
from app.realtime.pubsub import EventBus
from app.shared.config import Settings
from app.shared.database import Database
from app.shared.rate_limit import RateLimiter
from app.shared.redis import RedisProvider
from app.shared.security import TokenService


class Container:
    """Wires together the long-lived collaborators for the process.

    A single instance is stored on ``app.state.container`` and consulted by
    the request-scoped dependency providers in ``app.shared.dependencies``.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.database = Database(settings)
        self.redis = RedisProvider(settings)
        self.token_service = TokenService(settings)
        self.rate_limiter = RateLimiter(self.redis.client, enabled=settings.rate_limit_enabled)
        self.event_bus = EventBus(self.redis.client, settings)
        self.google_verifier = GoogleTokenVerifier(settings)

    async def shutdown(self) -> None:
        await self.event_bus.stop()
        await self.google_verifier.aclose()
        await self.redis.close()
        await self.database.dispose()
