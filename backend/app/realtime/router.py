"""Realtime WebSocket route: /ws/wall."""

from __future__ import annotations

import contextlib
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.realtime.schemas import EventType, WallEvent
from app.shared.container import Container
from app.shared.dependencies import get_container_ws
from app.shared.logging import get_logger
from app.stats.counters import Counters
from app.stats.service import StatsService
from app.users.repository import UserRepository
from app.wall.repository import NoteRepository

logger = get_logger(__name__)
router = APIRouter(tags=["realtime"])


async def _snapshot_event(container: Container) -> WallEvent:
    async for session in container.database.session():
        stats = StatsService(
            settings=container.settings,
            counters=Counters(container.redis.client),
            event_bus=container.event_bus,
            user_repository=UserRepository(session),
            note_repository=NoteRepository(session),
        )
        snapshot = await stats.snapshot()
    return WallEvent(type=EventType.COUNTERS_UPDATED, payload=snapshot.model_dump(mode="json"))


@router.websocket("/ws/wall")
async def wall_ws(
    websocket: WebSocket,
    container: Annotated[Container, Depends(get_container_ws)],
) -> None:
    bus = container.event_bus
    connection_id = uuid.uuid4().hex

    # Shed load rather than accept a socket this worker cannot serve.
    if not await bus.manager.connect(websocket, connection_id):
        await websocket.close(code=1013, reason="Server at capacity")
        return

    try:
        # Register presence immediately; the worker's batched heartbeat loop
        # keeps it fresh, and the coalesced broadcaster announces the change.
        with contextlib.suppress(Exception):
            await bus.heartbeat(connection_id)
        # Prime the new client with the current counters.
        await websocket.send_text((await _snapshot_event(container)).encode())
        while True:
            raw = await websocket.receive_text()
            if raw.strip() in {"ping", '{"action":"ping"}'}:
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001 - never let a socket crash the worker
        logger.warning("ws_error", error=str(exc))
    finally:
        await bus.manager.disconnect(websocket)
        with contextlib.suppress(Exception):
            await bus.leave(connection_id)
