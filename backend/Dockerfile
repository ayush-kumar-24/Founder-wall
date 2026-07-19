# syntax=docker/dockerfile:1

# --- Builder: install dependencies into a virtualenv -----------------------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.4.1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_NO_INTERACTION=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "poetry==${POETRY_VERSION}"

WORKDIR /app
# The lock file is copied with the manifest so builds are reproducible: the
# resolved dependency set is fixed at commit time, not at image build time.
COPY pyproject.toml poetry.lock README.md ./
RUN poetry check --lock && poetry install --only main --no-root

# --- Runtime ---------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH="/app" \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY pyproject.toml README.md ./
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health/live || exit 1

ENTRYPOINT ["entrypoint.sh"]
# Worker count comes from $WEB_CONCURRENCY (uvicorn reads it natively), so the
# same image scales from a laptop to a multi-core host without a rebuild.
#   --proxy-headers / --forwarded-allow-ips: we sit behind Nginx on a private
#     network, so the forwarded client IP is authoritative (and only trusted
#     because the port is never published directly).
#   --ws-max-size: cap inbound frames (64 KiB); the wall never needs more and
#     an unbounded frame is a trivial memory-exhaustion vector.
#   --timeout-graceful-shutdown: let in-flight requests drain on deploy.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*", \
     "--ws-max-size", "65536", \
     "--timeout-graceful-shutdown", "20"]
