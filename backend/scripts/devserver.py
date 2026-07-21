"""A local, Docker-free backend for frontend development.

Boots the real ASGI app on http://127.0.0.1:8000 with only Postgres and Redis
substituted (SQLite file + fakeredis) — the same substitution the smoke test
uses — and leaves it running so the Next.js dev server can talk to a real API,
WebSocket fan-out included.

Google ID-token verification runs in INSECURE mode (signatures are not
checked), so the frontend's "enter as a founder" dev sign-in works without a
real Google client. This is a development convenience only; production runs the
container, which refuses insecure tokens.

    python scripts/devserver.py            # sqlite at <temp>/founderwall-dev.db
    python scripts/devserver.py --fresh    # wipe that db first
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import tempfile
from pathlib import Path

import fakeredis.aioredis as fakeaioredis
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.shared.redis as redis_module  # noqa: E402
from app.main import create_app  # noqa: E402
from app.shared.config import Settings  # noqa: E402
from app.shared.database import Base, Database  # noqa: E402

DB_PATH = Path(tempfile.gettempdir()) / "founderwall-dev.db"


async def main(fresh: bool) -> int:
    if fresh and DB_PATH.exists():
        DB_PATH.unlink()

    settings = Settings(
        environment="local",
        database_url=f"sqlite+aiosqlite:///{DB_PATH.as_posix()}",
        jwt_secret="dev-secret-value-long-enough-for-local-only",
        google_allow_insecure_tokens=True,
        rate_limit_enabled=False,
        log_json=False,
        log_level="INFO",
        cors_origins=["*"],
        enable_docs=True,
        presence_broadcast_interval_seconds=2,
    )

    # In-process fakeredis stands in for a real Redis (single worker only).
    shared_fake = fakeaioredis.FakeRedis(decode_responses=True)
    redis_module.from_url = lambda *a, **k: shared_fake  # type: ignore[assignment]

    application = create_app(settings)

    # Build the schema up front, exactly as the container entrypoint's
    # `alembic upgrade head` would.
    db = Database(settings)
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await db.dispose()

    print(f"Founder Wall dev API on http://127.0.0.1:8000  (db: {DB_PATH})")
    config = uvicorn.Config(
        application, host="127.0.0.1", port=8000, log_level="info", ws_max_size=65536
    )
    await uvicorn.Server(config).serve()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fresh", action="store_true", help="wipe the dev db first")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.fresh)))
