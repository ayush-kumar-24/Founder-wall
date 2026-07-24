#!/usr/bin/env bash
#
# Preflight validation for the production .env. Run BEFORE `docker compose up`.
# Fails immediately (non-zero) with a clear message if anything required is
# missing, weak, still a placeholder, or inconsistent — so you never discover a
# bad secret later at runtime.
#
#   ./scripts/check-env.sh            # checks ./.env
#   ./scripts/check-env.sh /path/.env

set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found.  Run:  cp .env.example .env"
  exit 1
fi

# Load it.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

fail=0
missing() { echo "  [MISSING]     $1 is empty"; fail=1; }
warn()    { echo "  [PROBLEM]     $1"; fail=1; }

for v in POSTGRES_PASSWORD JWT_SECRET GOOGLE_CLIENT_ID NEXT_PUBLIC_GOOGLE_CLIENT_ID; do
  [ -n "${!v:-}" ] || missing "$v"
done

# JWT_SECRET strength + not a placeholder.
if [ -n "${JWT_SECRET:-}" ]; then
  [ "${#JWT_SECRET}" -ge 32 ] || warn "JWT_SECRET should be >= 32 characters"
  case "$JWT_SECRET" in
    *change-me*|*generate-your-own*|*CHANGE_ME*)
      warn "JWT_SECRET is still a placeholder — generate a fresh one" ;;
  esac
fi

# The two Google client ids MUST be identical.
if [ "${GOOGLE_CLIENT_ID:-}" != "${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" ]; then
  warn "GOOGLE_CLIENT_ID != NEXT_PUBLIC_GOOGLE_CLIENT_ID (they must match)"
fi

# Production safety.
if [ "${ENVIRONMENT:-}" = "production" ] && [ "${GOOGLE_ALLOW_INSECURE_TOKENS:-false}" = "true" ]; then
  warn "GOOGLE_ALLOW_INSECURE_TOKENS=true is unsafe when ENVIRONMENT=production"
fi

if [ "$fail" -ne 0 ]; then
  echo "Preflight FAILED — fix the items above before deploying."
  exit 1
fi
echo "Preflight OK — required environment looks good."
