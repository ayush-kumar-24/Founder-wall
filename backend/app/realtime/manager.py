"""In-process WebSocket connection registry."""

from __future__ import annotations

import asyncio

from fastapi import WebSocket

from app.shared.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Tracks WebSocket connections local to this process instance.

    Cross-instance fan-out is handled by :class:`EventBus` via Redis; this
    class only owns the sockets attached to *this* worker. Fan-out is
    concurrent and time-boxed so one slow or wedged client cannot stall
    delivery to everyone else.
    """

    def __init__(self, *, max_connections: int, send_timeout: float) -> None:
        # socket -> presence connection id
        self._connections: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()
        self._max_connections = max_connections
        self._send_timeout = send_timeout

    async def connect(self, websocket: WebSocket, connection_id: str) -> bool:
        """Accept and register a socket. Returns False if the cap is reached.

        The capacity check happens before ``accept`` so an overloaded worker
        sheds load instead of degrading every existing connection.
        """
        async with self._lock:
            if len(self._connections) >= self._max_connections:
                logger.warning("ws_capacity_reached", cap=self._max_connections)
                return False
        await websocket.accept()
        async with self._lock:
            self._connections[websocket] = connection_id
        logger.info("ws_connected", connections=len(self._connections))
        return True

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.pop(websocket, None)
        logger.info("ws_disconnected", connections=len(self._connections))

    @property
    def count(self) -> int:
        return len(self._connections)

    def connection_ids(self) -> tuple[str, ...]:
        """Presence ids for every socket on this worker (batched heartbeat)."""
        return tuple(self._connections.values())

    async def broadcast(self, message: str) -> None:
        """Send ``message`` to every local connection concurrently.

        Sockets that error or exceed the send timeout are pruned so a wedged
        client cannot apply back-pressure to the whole fan-out.
        """
        async with self._lock:
            targets = tuple(self._connections.keys())
        if not targets:
            return

        async def _send(connection: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(connection.send_text(message), timeout=self._send_timeout)
            except Exception:  # noqa: BLE001 - includes TimeoutError
                return connection
            return None

        results = await asyncio.gather(*(_send(c) for c in targets))
        dead = [c for c in results if c is not None]
        if dead:
            async with self._lock:
                for connection in dead:
                    self._connections.pop(connection, None)
            logger.info("ws_pruned", pruned=len(dead))
