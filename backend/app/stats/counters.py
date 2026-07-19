"""Fast, Redis-backed monotonic counters (thoughts) with DB reconciliation."""

from __future__ import annotations

from redis.asyncio import Redis


class Counters:
    """Wraps the Redis counters that back the live stats panel."""

    _THOUGHTS_KEY = "founderwall:counter:thoughts"

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def increment_thoughts(self, amount: int = 1) -> int:
        return int(await self._redis.incrby(self._THOUGHTS_KEY, amount))

    async def thoughts(self) -> int:
        value = await self._redis.get(self._THOUGHTS_KEY)
        return int(value) if value is not None else 0

    async def reconcile_thoughts(self, db_total: int) -> None:
        """Seed the counter from the DB if it has never been set."""
        if await self._redis.get(self._THOUGHTS_KEY) is None:
            await self._redis.set(self._THOUGHTS_KEY, db_total)
