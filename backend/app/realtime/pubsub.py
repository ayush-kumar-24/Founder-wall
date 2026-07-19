"""Redis-backed event bus: cross-instance fan-out, event log, and presence."""

from __future__ import annotations

import asyncio
import contextlib

from redis.asyncio import Redis

from app.realtime.manager import ConnectionManager
from app.realtime.schemas import EventType, WallEvent
from app.shared.config import Settings
from app.shared.logging import get_logger

logger = get_logger(__name__)


class EventBus:
    """Publishes wall events to Redis and fans them out to local sockets.

    Every application instance runs one subscriber loop. Publishing an event
    writes it to a durable Redis Stream (bounded history) and to a Pub/Sub
    channel; each instance's subscriber receives the channel message and
    delivers it to its own connected WebSockets via :class:`ConnectionManager`.
    """

    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._redis = redis
        self._settings = settings
        self._channel = settings.wall_events_channel
        self._stream = settings.wall_events_stream
        self._presence_key = "founderwall:presence"
        self._presence_lock_key = "founderwall:presence:publock"
        self._presence_last_key = "founderwall:presence:last"
        self.manager = ConnectionManager(
            max_connections=settings.ws_max_connections,
            send_timeout=settings.ws_send_timeout_seconds,
        )
        self._task: asyncio.Task[None] | None = None
        self._presence_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None

    # --- Publishing ------------------------------------------------------
    async def publish(self, event: WallEvent) -> None:
        payload = event.encode()
        await self._redis.xadd(
            self._stream,
            {"event": payload},
            maxlen=self._settings.wall_events_stream_maxlen,
            approximate=True,
        )
        await self._redis.publish(self._channel, payload)

    # --- Subscriber loop -------------------------------------------------
    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="event-bus-subscriber")
        if self._presence_task is None:
            self._presence_task = asyncio.create_task(
                self._presence_broadcast_loop(), name="presence-broadcaster"
            )
        if self._heartbeat_task is None:
            self._heartbeat_task = asyncio.create_task(
                self._heartbeat_loop(), name="presence-heartbeat"
            )

    async def stop(self) -> None:
        for task in (self._task, self._presence_task, self._heartbeat_task):
            if task is None:
                continue
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._task = None
        self._presence_task = None
        self._heartbeat_task = None

    async def _run(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel)
        logger.info("event_bus_started", channel=self._channel)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                await self.manager.broadcast(message["data"])
        except asyncio.CancelledError:
            raise
        finally:
            await pubsub.unsubscribe(self._channel)
            await pubsub.aclose()  # type: ignore[no-untyped-call]
            logger.info("event_bus_stopped")

    # --- Presence --------------------------------------------------------
    # Presence is a sorted set scored by server time; stale members are pruned
    # on every touch. Plain commands (no Lua) keep this portable across Redis
    # and in-memory fakes; presence counts tolerate the tiny non-atomic window.
    #
    # Heartbeats are deliberately SILENT: they refresh membership only. If every
    # connection published its own presence event we would emit O(N) events per
    # interval, each fanned out to N sockets — O(N^2) work that collapses the
    # wall at a few thousand viewers. Instead a single coalesced broadcaster
    # (see _presence_broadcast_loop) emits at most one event per change.
    async def _server_now(self) -> int:
        seconds, _micros = await self._redis.time()
        return int(seconds)

    async def heartbeat(self, *connection_ids: str) -> None:
        """Refresh presence membership for the given ids. Publishes nothing."""
        if not connection_ids:
            return
        now = await self._server_now()
        async with self._redis.pipeline(transaction=False) as pipe:
            # One ZADD carries every local connection — the cost of a heartbeat
            # tick is O(1) round trips no matter how many sockets are attached.
            pipe.zadd(self._presence_key, dict.fromkeys(connection_ids, now))
            pipe.zremrangebyscore(self._presence_key, 0, now - self._settings.online_ttl_seconds)
            await pipe.execute()

    async def _heartbeat_loop(self) -> None:
        """Batch-refresh presence for every socket on this worker."""
        interval = max(self._settings.online_ttl_seconds // 2, 5)
        while True:
            try:
                await asyncio.sleep(interval)
                await self.heartbeat(*self.manager.connection_ids())
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a Redis blip must not kill presence
                logger.warning("presence_heartbeat_failed", exc_info=True)

    async def leave(self, connection_id: str) -> None:
        await self._redis.zrem(self._presence_key, connection_id)

    async def online_count(self) -> int:
        now = await self._server_now()
        await self._redis.zremrangebyscore(
            self._presence_key, 0, now - self._settings.online_ttl_seconds
        )
        return int(await self._redis.zcard(self._presence_key))

    async def _presence_broadcast_loop(self) -> None:
        """Emit at most one presence event per change, cluster-wide.

        Every instance runs this loop, but a short-lived Redis lock elects a
        single publisher per interval, and the last published value is kept in
        Redis so an unchanged count produces no traffic at all. Presence cost
        is therefore O(1) per interval regardless of connection count.
        """
        interval = max(1, self._settings.presence_broadcast_interval_seconds)
        while True:
            try:
                await asyncio.sleep(interval)
                if not await self._redis.set(self._presence_lock_key, "1", nx=True, ex=interval):
                    continue  # Another instance is publishing this interval.
                count = await self.online_count()
                previous = await self._redis.get(self._presence_last_key)
                if previous is not None and int(previous) == count:
                    continue  # Nothing changed — stay silent.
                await self._redis.set(
                    self._presence_last_key,
                    count,
                    ex=self._settings.online_ttl_seconds * 4,
                )
                await self.publish(
                    WallEvent(type=EventType.PRESENCE_UPDATED, payload={"online": count})
                )
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a Redis blip must not kill presence
                logger.warning("presence_broadcast_failed", exc_info=True)
