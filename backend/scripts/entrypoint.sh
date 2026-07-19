#!/usr/bin/env bash
# Container entrypoint: apply migrations, then hand off to the given command.
set -euo pipefail

echo "[entrypoint] Running database migrations..."
alembic upgrade head

echo "[entrypoint] Starting: $*"
exec "$@"
