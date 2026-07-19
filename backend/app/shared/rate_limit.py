"""Redis-backed fixed-window rate limiter."""

from __future__ import annotations

from redis.asyncio import Redis

from app.shared.exceptions import RateLimitError


class RateLimiter:
    """Fixed-window limiter using INCR with a first-hit EXPIRE.

    Deliberately avoids server-side Lua so it runs identically against real
    Redis and in-memory fakes. The tiny window between INCR and EXPIRE can only
    ever *shorten* a window on a crash, never leak quota, so it is safe.
    """

    def __init__(self, redis: Redis, *, enabled: bool = True) -> None:
        self._redis = redis
        self._enabled = enabled

    async def hit(self, key: str, *, limit: int, window_seconds: int = 60) -> int:
        """Register one hit for ``key``; raise RateLimitError when over ``limit``.

        INCR and EXPIRE run in a single pipeline so the key is *always* given a
        TTL — a crash can never leave a counter without expiry and permanently
        lock a client out. Setting EXPIRE each hit keeps the window bounded.
        """
        if not self._enabled:
            return 0
        redis_key = f"ratelimit:{key}:{window_seconds}"
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.incr(redis_key)
            pipe.expire(redis_key, window_seconds)
            results = await pipe.execute()
        current = int(results[0])
        if current > limit:
            raise RateLimitError(f"Rate limit exceeded: {limit} requests per {window_seconds}s")
        return current
