"""Realtime fan-out and presence tests."""

from __future__ import annotations

import asyncio

from app.realtime.manager import ConnectionManager
from app.realtime.schemas import EventType, WallEvent
from app.shared.container import Container


class _FakeSocket:
    def __init__(self, *, fail: bool = False, hang: bool = False) -> None:
        self.sent: list[str] = []
        self._fail = fail
        self._hang = hang

    async def accept(self) -> None:  # pragma: no cover - trivial
        pass

    async def send_text(self, message: str) -> None:
        if self._fail:
            raise RuntimeError("socket closed")
        if self._hang:
            await asyncio.sleep(30)
        self.sent.append(message)


def _manager(*, max_connections: int = 10, send_timeout: float = 5.0) -> ConnectionManager:
    return ConnectionManager(max_connections=max_connections, send_timeout=send_timeout)


async def test_connection_manager_broadcasts_and_prunes() -> None:
    manager = _manager()
    good = _FakeSocket()
    dead = _FakeSocket(fail=True)
    assert await manager.connect(good, "c1")  # type: ignore[arg-type]
    assert await manager.connect(dead, "c2")  # type: ignore[arg-type]
    assert manager.count == 2

    await manager.broadcast("hello")
    assert good.sent == ["hello"]
    # The failing socket is pruned automatically.
    assert manager.count == 1


async def test_connection_manager_enforces_capacity() -> None:
    manager = _manager(max_connections=1)
    assert await manager.connect(_FakeSocket(), "c1")  # type: ignore[arg-type]
    # Beyond the cap the worker sheds load instead of accepting the socket.
    assert not await manager.connect(_FakeSocket(), "c2")  # type: ignore[arg-type]
    assert manager.count == 1


async def test_slow_client_cannot_stall_broadcast() -> None:
    """A wedged socket must be dropped, not block delivery to everyone else."""
    manager = _manager(send_timeout=0.05)
    good = _FakeSocket()
    slow = _FakeSocket(hang=True)
    await manager.connect(good, "c1")  # type: ignore[arg-type]
    await manager.connect(slow, "c2")  # type: ignore[arg-type]

    await asyncio.wait_for(manager.broadcast("hello"), timeout=2)

    assert good.sent == ["hello"]
    assert manager.count == 1  # the slow client was pruned


async def test_connection_ids_are_tracked_for_batched_heartbeat() -> None:
    manager = _manager()
    await manager.connect(_FakeSocket(), "conn-a")  # type: ignore[arg-type]
    await manager.connect(_FakeSocket(), "conn-b")  # type: ignore[arg-type]
    assert set(manager.connection_ids()) == {"conn-a", "conn-b"}


async def test_presence_counts(container: Container) -> None:
    bus = container.event_bus
    assert await bus.online_count() == 0
    await bus.heartbeat("conn-1")
    await bus.heartbeat("conn-2")
    assert await bus.online_count() == 2
    await bus.leave("conn-1")
    assert await bus.online_count() == 1


async def test_heartbeat_batches_many_connections(container: Container) -> None:
    """Heartbeat must accept every local id in one call (O(1) round trips)."""
    bus = container.event_bus
    ids = [f"conn-{i}" for i in range(50)]
    await bus.heartbeat(*ids)
    assert await bus.online_count() == 50
    # A no-op heartbeat must not touch Redis or raise.
    await bus.heartbeat()
    assert await bus.online_count() == 50


async def test_heartbeat_publishes_nothing(container: Container) -> None:
    """Heartbeats must stay silent — this is the O(N^2) guard.

    If a heartbeat publishes, then N connections each emit an event per
    interval and every event fans out to N sockets: O(N^2) work per tick,
    which melts the wall at a few thousand viewers. Presence changes are
    announced by the single coalesced broadcaster instead.
    """
    bus = container.event_bus
    stream = container.settings.wall_events_stream
    before = int(await container.redis.client.xlen(stream))

    await bus.heartbeat(*[f"conn-{i}" for i in range(25)])
    await bus.heartbeat("conn-0")
    await bus.leave("conn-0")

    after = int(await container.redis.client.xlen(stream))
    assert after == before, "presence heartbeats must not emit events"


async def test_publish_appends_to_stream(container: Container) -> None:
    bus = container.event_bus
    before = int(await container.redis.client.xlen(container.settings.wall_events_stream))
    await bus.publish(WallEvent(type=EventType.COUNTERS_UPDATED, payload={"thoughts": 1}))
    after = int(await container.redis.client.xlen(container.settings.wall_events_stream))
    assert after == before + 1
