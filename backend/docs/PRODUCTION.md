# Founder Wall — Production Readiness

Operational contract for running Founder Wall at scale. Everything here is
either enforced by code (linked) or is a deliberate operator decision.

---

## 1. Before you deploy

`ENVIRONMENT=production` makes the app **refuse to start** on unsafe config
([`app/shared/config.py`](../app/shared/config.py), `_enforce_production_safety`).
A crash at boot is the intended behaviour — silent insecurity is worse than
downtime.

| Variable | Requirement | Enforced |
|---|---|---|
| `JWT_SECRET` | Unique, ≥32 chars | Startup fails |
| `GOOGLE_ALLOW_INSECURE_TOKENS` | Must be `false` | Startup fails |
| `DEBUG` | Must be `false` | Startup fails |
| `CORS_ORIGINS` | List real origins, not `*` | Warned only (see below) |
| `ENABLE_DOCS` | Ignored in production; docs are always off | Forced |
| `POSTGRES_PASSWORD` | Change from the compose default | **Operator** |
| `TRUST_PROXY_HEADERS` | `true` only behind a proxy | **Operator** |

**CORS.** A wildcard origin automatically disables credentialed CORS
(`cors_allow_credentials`), because the spec forbids `*` with credentials and
browsers reject it. The wall's reads are public, so `*` is *workable* — but
list real origins in production.

**`TRUST_PROXY_HEADERS`.** With this on, the client IP for rate limiting comes
from `X-Forwarded-For`. That is correct behind Nginx (as shipped) and
**dangerous if the app is ever exposed directly** — a client could spoof the
header and evade rate limits. It is on in compose only because `api` publishes
no ports and is reachable solely through Nginx.

**Secrets.** `.env` is gitignored and excluded from the image
(`.dockerignore`). Copy `.env.example`, never commit the result. In production,
inject via your orchestrator's secret store rather than a file.

---

## 2. Deployment

```bash
cp .env.example .env
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
docker compose up --build -d
docker compose logs -f api
```

Topology: **Nginx** (only published port) → **api** (uvicorn, private) →
**Postgres** + **Redis**.

**Migrations.** `scripts/entrypoint.sh` runs `alembic upgrade head` on every
container start. Concurrent replica starts are serialised by a Postgres
advisory lock ([`alembic/env.py`](../alembic/env.py)) — the first replica
migrates, the rest block and then find no work.

> At larger scale, promote migrations to a dedicated pre-deploy job rather than
> running them in every app container. The advisory lock makes the current
> arrangement *safe*, not *ideal*: a long migration delays every replica's boot.
> Expand-and-contract for destructive changes — never drop a column in the same
> release that stops writing it.

**Rollout.** `stop_grace_period: 30s` plus uvicorn's
`--timeout-graceful-shutdown 20` lets in-flight requests drain. WebSocket
clients are dropped on shutdown and must reconnect — the frontend should
reconnect with jittered backoff, or a rollout becomes a self-inflicted
thundering herd.

**Scaling.** `WEB_CONCURRENCY` sets uvicorn workers per container. Each worker
runs its own Redis subscriber and fans out to only its own sockets, so scaling
out is safe and linear.

> **Connection math — the most common way to take Postgres down.**
> Total connections = `DB_POOL_SIZE` × `WEB_CONCURRENCY` × replicas.
> At the defaults (10 × 2 × 3 = 60) you are already over half of Postgres's
> default `max_connections=100`. Raise `max_connections`, lower the pool, or
> put **PgBouncer** in front. Behind PgBouncer in transaction mode you **must**
> set `DB_STATEMENT_CACHE_SIZE=0` — asyncpg's per-connection prepared-statement
> cache is incompatible with transaction pooling.

---

## 3. Observability

**Logs** are structured JSON on stdout (`LOG_JSON=true`), ready for any
collector. Every request carries a `request_id`, echoed in the `X-Request-ID`
response header and in the body of 500s — that id is the thread to pull when a
founder reports a problem.

SQLAlchemy's engine logger is pinned to `WARNING`
([`app/shared/logging.py`](../app/shared/logging.py)). Do not raise it to
`INFO` in production: SQLAlchemy treats that as `echo=True` and logs **every
statement and its bound parameters**, which is both unbounded log volume and
user content in your logs. Use `DB_ECHO=true` locally instead.

**Health endpoints**

| Endpoint | Checks | Use for |
|---|---|---|
| `/health/live` | Process is up. No I/O. | Container/LB liveness |
| `/health` | Postgres + Redis reachable | Readiness, dashboards |

Point liveness probes at `/health/live` only. A liveness probe that checks
dependencies turns a brief database blip into a restart storm.

**Monitor at minimum**

- `5xx` rate and p99 latency per route (from access logs)
- WebSocket connections per worker vs `WS_MAX_CONNECTIONS` — a worker at its
  cap logs `ws_capacity_reached` and sheds new sockets
- `ws_pruned` — sustained pruning means clients too slow to keep up
- Redis: memory, evicted keys, `founderwall:stream` length
- Postgres: connection count vs `max_connections`, replication lag, slow queries
- Container restarts (a crash-looping config guard looks like an outage)

**Not included.** There is no `/metrics` endpoint; this audit deliberately
added no new features. If you want Prometheus, that is a scoped follow-up —
logs carry enough to derive rate/latency/error in the meantime.

---

## 4. Backup strategy

**Postgres is the only source of truth.** Redis holds counters, presence, and
a bounded event stream — all of it is either reconstructible from Postgres or
worthless after a restart.

| Layer | Method | Cadence | Retention |
|---|---|---|---|
| Postgres | Base backup (`pg_basebackup`) | Daily | 30 days |
| Postgres | WAL archiving → object storage | Continuous | 30 days |
| Postgres | Logical dump (`pg_dump -Fc`) | Daily | 7 days |
| Redis | AOF (`appendonly yes`, already on) | Continuous | Local volume |
| Secrets | Secret store's own backup | On change | Indefinite |

Continuous WAL archiving is what buys point-in-time recovery; daily dumps alone
mean up to 24h of lost thoughts. `pgdata` and `redisdata` are named volumes —
they survive `docker compose down` but **not** `down -v`.

**A backup you have not restored is not a backup.** Restore into a scratch
database monthly and assert row counts against production. Untested backups
fail exactly when you need them.

---

## 5. Disaster recovery

Targets: **RPO ≤ 5 min** (WAL archive interval), **RTO ≤ 1 h**.

**Total Postgres loss**
1. Provision a new instance.
2. Restore the latest base backup.
3. Replay WAL to the target timestamp (PITR).
4. Point `DATABASE_URL` at it; start one replica and confirm `/health`.
5. Scale out.

Do **not** run `alembic upgrade head` against a restored database before
checking `alembic_version` — the backup already contains the schema at its
point in time.

**Total Redis loss** — not a disaster. Restart it. Counters reseed from
Postgres, presence rebuilds from live heartbeats within `ONLINE_TTL_SECONDS`,
and the event stream is a bounded cache. Expect a brief blip in counters and
`online`; no founder data is at risk.

**Corrupted deploy** — roll back to the previous image tag. Roll the *schema*
back only if the release contained a destructive migration; this is why
expand-and-contract matters.

**The one-active-note invariant** is enforced by a partial unique index
(`uq_notes_active_per_user`), not by application code. If a restore or manual
intervention ever drops it, concurrent creates will silently produce duplicate
active notes. `tests/test_migrations.py` asserts the index *and its predicate*
survive migration — the predicate matters, because an index whose `WHERE`
clause does not match the stored enum value is silently inert.

---

## 6. Known limits

Honest boundaries of what has been verified.

- **Not executed in this environment:** `docker compose up`, and load testing
  against real Postgres/Redis. Docker is unavailable here. Compose/Dockerfile
  were validated structurally; the full request/WebSocket path was exercised
  end-to-end on a real uvicorn server against SQLite + fakeredis
  (`scripts/smoke.py`, 16/16). **Run `docker compose up` on a Linux host before
  trusting the container path.**
- **Throughput is unmeasured.** `scripts/loadtest.py` verifies fan-out
  *correctness* (300 sockets, 1500/1500 delivered, 0 missed) which is
  host-independent. Its req/s figures are not: this dev host's loopback stack
  caps a *bare FastAPI app with no middleware* at single-digit rps under
  concurrent connections. Use `loadtest/locustfile.py` against a real Linux
  deployment for capacity planning.
- **Counter drift.** Thought counts are incremented in Redis after the note is
  placed but before the request's transaction commits. A crash in that window
  over-counts. Reconciliation reseeds from Postgres on demand; the wall's
  counters are decorative, not financial.
- **Access tokens cannot be revoked** before their 15-minute TTL. Disabling an
  account stops refresh immediately but leaves a short window. Shorten
  `ACCESS_TOKEN_TTL_SECONDS` if that window is unacceptable.
- **Rate limits are per worker's view of Redis**, keyed by client IP. Users
  behind one NAT share a bucket.
