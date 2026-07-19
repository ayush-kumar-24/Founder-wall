"""Redis client factory and lifecycle helper."""

from __future__ import annotations

from redis.asyncio import Redis, from_url
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.shared.config import Settings


def create_redis(settings: Settings) -> Redis:
    """Create an async Redis client with decoded string responses.

    Timeouts are bounded and transient faults retried with backoff so a brief
    Redis blip degrades latency rather than failing every in-flight request.
    """
    return from_url(
        str(settings.redis_url),
        encoding="utf-8",
        decode_responses=True,
        health_check_interval=30,
        socket_timeout=settings.redis_socket_timeout,
        socket_connect_timeout=settings.redis_connect_timeout,
        socket_keepalive=True,
        max_connections=settings.redis_max_connections,
        retry=Retry(ExponentialBackoff(cap=0.5, base=0.05), retries=3),
        retry_on_error=[RedisConnectionError, RedisTimeoutError],
    )


class RedisProvider:
    """Owns the Redis client for the application lifetime."""

    def __init__(self, settings: Settings) -> None:
        self._client = create_redis(settings)

    @property
    def client(self) -> Redis:
        return self._client

    async def ping(self) -> bool:
        return bool(await self._client.ping())

    async def close(self) -> None:
        await self._client.aclose()
