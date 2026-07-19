# Founder Wall — Backend

A real-time interactive digital monument. Founders sign in with Google and place
a single anonymous sticky note on a shared wall; the wall, its counters, and its
moderation queue update live over WebSockets.

Built as a **modular monolith**: each module owns its `router`, `service`,
`repository`, `schemas`, `models`, and `dependencies`.

```
app/
  shared/       config, database, redis, security, logging, rate limiting, DI container
  auth/         Google OAuth verification, JWT sessions, refresh-token rotation
  users/        founder identity & provisioning
  wall/         sticky notes, tiles, server-controlled placement
  moderation/   content screening + review queue
  realtime/     WebSockets, presence, Redis Pub/Sub fan-out, Redis Streams event log
  stats/        live counters (founders, thoughts, online)
  analytics/    activity aggregation over the event stream
```

## Stack

Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic · PostgreSQL · Redis
(Pub/Sub + Streams) · WebSockets · Google OAuth · JWT · Docker Compose · Nginx ·
Poetry · Pytest.

## Endpoints

| Method | Path                                   | Auth       | Purpose                        |
|--------|----------------------------------------|------------|--------------------------------|
| GET    | `/health`                              | –          | Liveness + dependency health   |
| POST   | `/auth/google`                         | –          | Exchange Google ID token       |
| POST   | `/auth/refresh`                        | –          | Rotate refresh token           |
| POST   | `/auth/logout`                         | –          | Revoke refresh token           |
| GET    | `/auth/me`                             | access     | Current founder profile        |
| GET    | `/wall/manifest`                       | –          | Wall + tile layout             |
| GET    | `/wall/tiles/{id}`                     | –          | Notes within a tile            |
| GET    | `/wall/notes/me`                       | access     | Your active note               |
| POST   | `/wall/notes`                          | access     | Place your note                |
| PATCH  | `/wall/notes/{id}`                     | access     | Edit your note                 |
| DELETE | `/wall/notes/{id}`                     | access     | Remove your note               |
| POST   | `/moderation/notes/{id}/report`        | access     | Report a note                  |
| GET    | `/moderation/queue`                    | moderator  | Open review queue              |
| POST   | `/moderation/reports/{id}/resolve`     | moderator  | Resolve a report               |
| GET    | `/stats`                               | –          | Live counters                  |
| GET    | `/analytics/overview`                  | moderator  | Activity overview              |
| WS     | `/ws/wall`                             | –          | Realtime event stream          |

Interactive docs at `/docs` (set `ENABLE_DOCS=true`; always disabled when
`ENVIRONMENT=production`).

## Run with Docker

```bash
cp .env.example .env
# set a strong JWT_SECRET; add GOOGLE_CLIENT_ID for real Google login
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
docker compose up --build
```

Nginx serves the API on `http://localhost/` (health at `/health`, WebSocket at
`/ws/wall`). Migrations run automatically on container start.

> `.env.example` is committed — never put a real secret in it. Generate your
> own into `.env`, which is gitignored. With `ENVIRONMENT=production` the app
> refuses to start on a weak or repo-published `JWT_SECRET`.

**Before deploying, read [docs/PRODUCTION.md](docs/PRODUCTION.md)** — required
configuration, connection-pool math, backup/restore, disaster recovery, and the
known limits of what has been verified.

## Verification

```bash
make check      # ruff + mypy + pytest
make smoke      # end-to-end against a real uvicorn server (16 checks)
make loadtest   # WebSocket fan-out regression harness
```

## Local development

```bash
poetry install
# Point DATABASE_URL / REDIS_URL at local services, then:
make migrate
make run
make check      # ruff + mypy + pytest
```

## Authentication model

The frontend performs Google Sign-In and posts the resulting **ID token** to
`POST /auth/google`. The backend verifies it against Google's JWKS, provisions
the founder (idempotently, by Google `sub`), and returns a short-lived **access
token** plus a rotating **refresh token**. Refresh tokens are stored only as
keyed hashes; refreshing revokes the presented token and issues a new one, and
detected reuse revokes the whole family.

## Realtime design

Writes go through REST. Each mutation publishes a `WallEvent` to a Redis Pub/Sub
channel **and** appends it to a bounded Redis Stream. Every app instance runs one
subscriber that fans events out to its local WebSocket connections, so the system
scales horizontally behind Nginx. Presence (online users) is tracked in a Redis
sorted set scored by server time with TTL-based expiry.
