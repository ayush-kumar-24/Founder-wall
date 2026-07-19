"""End-to-end smoke test against a real uvicorn server.

Boots the actual ASGI app through its real lifespan (container, event bus,
Redis subscriber, background loops) on a real socket, then drives every
endpoint in the public contract plus the WebSocket fan-out path.

This is the closest verification to `docker compose up` that does not require
Docker: only Postgres and Redis are substituted (SQLite + fakeredis).

    python scripts/smoke.py
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import socket
import sys
import tempfile
from pathlib import Path

import fakeredis.aioredis as fakeaioredis
import uvicorn
import websockets
from httpx import AsyncClient
from jose import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.shared.redis as redis_module  # noqa: E402
from app.main import create_app  # noqa: E402
from app.shared.config import Settings  # noqa: E402
from app.shared.database import Base  # noqa: E402

PASS = "PASS"
FAIL = "FAIL"
_results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _results.append((PASS if ok else FAIL, name, detail))
    print(f"  [{PASS if ok else FAIL}] {name}{f' — {detail}' if detail else ''}")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _credential(sub: str, email: str) -> str:
    return jwt.encode(
        {"sub": sub, "email": email, "name": "Smoke Founder", "email_verified": True},
        "unused",
        algorithm="HS256",
    )


async def _wait_for_server(port: int, deadline_seconds: float = 20.0) -> bool:
    deadline = asyncio.get_running_loop().time() + deadline_seconds
    while asyncio.get_running_loop().time() < deadline:
        try:
            _, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.close()
            await writer.wait_closed()
            return True
        except OSError:
            await asyncio.sleep(0.1)
    return False


async def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="founderwall-smoke-"))
    settings = Settings(
        environment="local",
        database_url=f"sqlite+aiosqlite:///{(tmp / 'smoke.db').as_posix()}",
        jwt_secret="smoke-secret-value-long-enough-for-tests",
        google_allow_insecure_tokens=True,
        rate_limit_enabled=False,
        log_json=False,
        log_level="WARNING",
        cors_origins=["*"],
        enable_docs=True,
        presence_broadcast_interval_seconds=1,
    )

    # Substitute Redis only; everything else is the real code path.
    shared_fake = fakeaioredis.FakeRedis(decode_responses=True)
    redis_module.from_url = lambda *a, **k: shared_fake  # type: ignore[assignment]

    application = create_app(settings)

    # The real lifespan builds the schema-less DB, so create tables up front
    # exactly as `alembic upgrade head` would in the container entrypoint.
    from app.shared.database import Database

    db = Database(settings)
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await db.dispose()

    port = _free_port()
    config = uvicorn.Config(
        application, host="127.0.0.1", port=port, log_level="warning", ws_max_size=65536
    )
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())

    try:
        if not await _wait_for_server(port):
            print("server failed to start")
            return 1

        base = f"http://127.0.0.1:{port}"
        async with AsyncClient(base_url=base, timeout=10.0) as http:
            print("\n-- health --")
            live = await http.get("/health/live")
            check("GET /health/live -> 200", live.status_code == 200)
            health = await http.get("/health")
            check(
                "GET /health reports dependencies",
                health.status_code == 200 and health.json().get("status") == "ok",
                json.dumps(health.json()),
            )
            check(
                "X-Request-ID correlation header present",
                bool(health.headers.get("x-request-id")),
            )

            print("\n-- wall (public) --")
            manifest = await http.get("/wall/manifest")
            check("GET /wall/manifest -> 200", manifest.status_code == 200)
            tiles = manifest.json()["total_tiles"]
            tile = await http.get("/wall/tiles/0")
            check("GET /wall/tiles/0 -> 200", tile.status_code == 200, f"{tiles} tiles")
            stats = await http.get("/stats")
            check("GET /stats -> 200", stats.status_code == 200, json.dumps(stats.json()))

            print("\n-- auth --")
            login = await http.post(
                "/auth/google", json={"credential": _credential("smoke-1", "smoke@example.com")}
            )
            check("POST /auth/google -> 200", login.status_code == 200)
            tokens = login.json()
            headers = {"Authorization": f"Bearer {tokens['access_token']}"}
            me = await http.get("/auth/me", headers=headers)
            check("GET /auth/me -> 200", me.status_code == 200, me.json().get("handle", ""))
            refreshed = await http.post(
                "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
            )
            check("POST /auth/refresh rotates", refreshed.status_code == 200)
            replay = await http.post(
                "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
            )
            check("replayed refresh token rejected", replay.status_code == 401)

            print("\n-- websocket + realtime fan-out --")
            # Re-authenticate: the replay above revoked the family by design.
            login2 = await http.post(
                "/auth/google", json={"credential": _credential("smoke-2", "smoke2@example.com")}
            )
            headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}

            async with websockets.connect(f"ws://127.0.0.1:{port}/ws/wall") as ws:
                first = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                check(
                    "WS /ws/wall primes client with counters",
                    first.get("type") == "counters.updated",
                    first.get("type", ""),
                )

                created = await http.post(
                    "/wall/notes", json={"content": "hello from smoke"}, headers=headers2
                )
                check("POST /wall/notes -> 201", created.status_code == 201, created.text[:120])

                # The note must arrive over the Redis pub/sub -> WS fan-out path.
                got_note = False
                with contextlib.suppress(TimeoutError):
                    deadline = asyncio.get_running_loop().time() + 10
                    while asyncio.get_running_loop().time() < deadline:
                        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if event.get("type") == "note.created":
                            got_note = True
                            break
                check("WS receives note.created broadcast", got_note)

                pong_ok = False
                await ws.send("ping")
                with contextlib.suppress(TimeoutError):
                    deadline = asyncio.get_running_loop().time() + 5
                    while asyncio.get_running_loop().time() < deadline:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
                        if msg.get("type") == "pong":
                            pong_ok = True
                            break
                check("WS ping/pong keepalive", pong_ok)

            print("\n-- invariants --")
            second = await http.post(
                "/wall/notes", json={"content": "second note"}, headers=headers2
            )
            check("one active note per founder enforced", second.status_code == 409)
            stats_after = await http.get("/stats")
            body = stats_after.json()
            check(
                "counters reflect the new note",
                body.get("thoughts", 0) >= 1,
                json.dumps(body),
            )
    finally:
        server.should_exit = True
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(server_task, timeout=15)

    failures = [r for r in _results if r[0] == FAIL]
    print(f"\n{len(_results) - len(failures)}/{len(_results)} checks passed")
    if failures:
        for _, name, detail in failures:
            print(f"  FAILED: {name} {detail}")
        return 1
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
