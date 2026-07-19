"""Load test: WebSocket fan-out and HTTP read throughput.

Boots the real app on a real socket and applies concurrent load, reporting
latency percentiles. The headline metric is *fan-out latency*: how long a
note takes to reach every connected viewer. That is the number that decides
whether the wall feels alive at scale.

    python scripts/loadtest.py                 # defaults: 250 sockets
    python scripts/loadtest.py --sockets 1000 --notes 20

Postgres/Redis are substituted with SQLite/fakeredis, so absolute numbers are
not production figures — this measures the application's own fan-out and
event-loop behaviour, and catches O(N^2) regressions. Run the locustfile
(loadtest/locustfile.py) against a real deployment for capacity planning.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import socket
import statistics
import sys
import tempfile
import time
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
from app.shared.database import Base, Database  # noqa: E402


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _credential(sub: str) -> str:
    return jwt.encode(
        {"sub": sub, "email": f"{sub}@example.com", "name": sub, "email_verified": True},
        "unused",
        algorithm="HS256",
    )


def _percentiles(samples: list[float], label: str, unit: str = "ms") -> None:
    if not samples:
        print(f"  {label}: no samples")
        return
    ordered = sorted(samples)

    def pct(p: float) -> float:
        idx = min(int(len(ordered) * p), len(ordered) - 1)
        return ordered[idx]

    print(
        f"  {label}: n={len(ordered)} "
        f"p50={pct(0.50):.1f}{unit} p95={pct(0.95):.1f}{unit} "
        f"p99={pct(0.99):.1f}{unit} max={ordered[-1]:.1f}{unit} "
        f"mean={statistics.fmean(ordered):.1f}{unit}"
    )


async def _wait_for_server(port: int, deadline_seconds: float = 20.0) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + deadline_seconds
    while loop.time() < deadline:
        try:
            _, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.close()
            await writer.wait_closed()
            return True
        except OSError:
            await asyncio.sleep(0.1)
    return False


async def run(sockets: int, notes: int, readers: int) -> int:
    tmp = Path(tempfile.mkdtemp(prefix="founderwall-load-"))
    settings = Settings(
        environment="local",
        database_url=f"sqlite+aiosqlite:///{(tmp / 'load.db').as_posix()}",
        jwt_secret="load-secret-value-long-enough-for-tests",
        google_allow_insecure_tokens=True,
        rate_limit_enabled=False,
        log_json=True,
        log_level="ERROR",
        cors_origins=["*"],
        ws_max_connections=100_000,
        wall_columns=200,
        wall_rows=200,
    )
    shared_fake = fakeaioredis.FakeRedis(decode_responses=True)
    redis_module.from_url = lambda *a, **k: shared_fake  # type: ignore[assignment]

    application = create_app(settings)
    db = Database(settings)
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await db.dispose()

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            application, host="127.0.0.1", port=port, log_level="error", ws_max_size=65536
        )
    )
    task = asyncio.create_task(server.serve())
    failures = 0

    try:
        if not await _wait_for_server(port):
            print("server failed to start")
            return 1
        base = f"http://127.0.0.1:{port}"

        print("\n=== Founder Wall load test ===")
        print(f"sockets={sockets} notes={notes} readers={readers}\n")

        async with AsyncClient(base_url=base, timeout=30.0) as http:
            # --- Authenticate the writers -------------------------------
            writers: list[dict[str, str]] = []
            for i in range(notes):
                r = await http.post("/auth/google", json={"credential": _credential(f"load-w{i}")})
                writers.append({"Authorization": f"Bearer {r.json()['access_token']}"})

            # --- Open the viewer fleet ----------------------------------
            print(f"-- opening {sockets} websockets --")
            opened = time.perf_counter()
            conns: list[websockets.WebSocketClientProtocol] = []
            connect_errors = 0

            async def _open() -> None:
                nonlocal connect_errors
                try:
                    ws = await websockets.connect(
                        f"ws://127.0.0.1:{port}/ws/wall", open_timeout=30, max_queue=256
                    )
                    await asyncio.wait_for(ws.recv(), timeout=30)  # priming snapshot
                    conns.append(ws)
                except Exception:
                    connect_errors += 1

            # Open in waves to avoid a thundering-herd on the client side.
            wave = 100
            for start in range(0, sockets, wave):
                await asyncio.gather(*(_open() for _ in range(start, min(start + wave, sockets))))
            connect_secs = time.perf_counter() - opened
            print(
                f"  connected={len(conns)} errors={connect_errors} "
                f"in {connect_secs:.1f}s ({len(conns) / max(connect_secs, 1e-9):.0f}/s)"
            )
            if connect_errors:
                failures += 1

            # --- Measure fan-out latency --------------------------------
            print(f"\n-- broadcasting {notes} notes to {len(conns)} viewers --")
            fanout: list[float] = []
            missed = 0

            async def _await_note(ws: websockets.WebSocketClientProtocol, sent: float) -> None:
                nonlocal missed
                try:
                    deadline = time.perf_counter() + 20
                    while time.perf_counter() < deadline:
                        raw = await asyncio.wait_for(ws.recv(), timeout=20)
                        event = json.loads(raw)
                        if event.get("type") == "note.created":
                            fanout.append((time.perf_counter() - sent) * 1000)
                            return
                    missed += 1
                except Exception:
                    missed += 1

            write_latency: list[float] = []
            for i, headers in enumerate(writers):
                sent = time.perf_counter()
                waiters = [asyncio.create_task(_await_note(ws, sent)) for ws in conns]
                await asyncio.sleep(0)  # let receivers park on recv first
                t0 = time.perf_counter()
                resp = await http.post(
                    "/wall/notes", json={"content": f"load note {i}"}, headers=headers
                )
                write_latency.append((time.perf_counter() - t0) * 1000)
                if resp.status_code != 201:
                    print(f"  write failed: {resp.status_code} {resp.text[:100]}")
                    failures += 1
                await asyncio.gather(*waiters)

            _percentiles(write_latency, "POST /wall/notes")
            _percentiles(fanout, "fan-out to viewer")
            print(f"  delivered={len(fanout)} missed={missed}")
            if missed:
                failures += 1

            # --- Concurrent read throughput -----------------------------
            print(f"\n-- {readers} concurrent readers --")
            read_latency: list[float] = []
            read_errors = 0

            async def _read(path: str) -> None:
                nonlocal read_errors
                t0 = time.perf_counter()
                try:
                    r = await http.get(path)
                    if r.status_code != 200:
                        read_errors += 1
                    read_latency.append((time.perf_counter() - t0) * 1000)
                except Exception:
                    read_errors += 1

            t0 = time.perf_counter()
            paths = ["/wall/manifest", "/stats", "/wall/tiles/0", "/health/live"]
            await asyncio.gather(*(_read(paths[i % len(paths)]) for i in range(readers)))
            elapsed = time.perf_counter() - t0
            _percentiles(read_latency, "GET (mixed read paths)")
            print(f"  throughput={readers / max(elapsed, 1e-9):.0f} req/s errors={read_errors}")
            print(
                "  NOTE: throughput here is bounded by the host's loopback stack and\n"
                "  the SQLite substitute, not by the application. On Windows a bare\n"
                "  FastAPI app with no middleware measures the same ceiling. Use\n"
                "  loadtest/locustfile.py against a real Linux deployment for\n"
                "  capacity planning; this harness exists to catch fan-out\n"
                "  regressions (see delivered/missed above), which are host-independent."
            )

            # --- Presence correctness under load ------------------------
            stats = (await http.get("/stats")).json()
            print(f"\n-- presence --\n  online={stats['online']} (sockets held open={len(conns)})")
            if stats["online"] < len(conns) * 0.5:
                print("  WARNING: presence undercounts connected viewers")

            for ws in conns:
                with contextlib.suppress(Exception):
                    await ws.close()
    finally:
        server.should_exit = True
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(task, timeout=20)

    print("\nLOAD TEST: " + ("FAILURES DETECTED" if failures else "OK"))
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sockets", type=int, default=250)
    parser.add_argument("--notes", type=int, default=10)
    parser.add_argument("--readers", type=int, default=500)
    args = parser.parse_args()
    return asyncio.run(run(args.sockets, args.notes, args.readers))


if __name__ == "__main__":
    raise SystemExit(main())
