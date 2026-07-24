#!/usr/bin/env bash
#
# Post-deployment smoke test. Verifies the live stack end-to-end over HTTPS.
# Use after the initial migration AND after every future update/restart.
#
#   ./scripts/smoke-test.sh your-domain.com
#
# Exit code 0 = all checks passed, non-zero = one or more failed.

set -uo pipefail   # deliberately not -e: run every check, then summarise.

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then echo "usage: $0 your-domain.com"; exit 2; fi
BASE="https://$DOMAIN"

pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

echo "Smoke-testing $BASE ..."

# 1. Valid HTTPS certificate (curl -f fails on TLS/HTTP errors).
if curl -sSf -o /dev/null "$BASE/health/live"; then ok "HTTPS cert + /health/live (200)"; else no "HTTPS / cert / health-live"; fi

# 2. /health with dependency checks (PostgreSQL + Redis).
H=$(curl -sf "$BASE/health" 2>/dev/null || true)
echo "$H" | grep -q '"status":"ok"'    && ok "/health overall ok"        || no "/health"
echo "$H" | grep -q '"database":"ok"'  && ok "PostgreSQL connectivity"   || no "PostgreSQL (health.database)"
echo "$H" | grep -q '"redis":"ok"'     && ok "Redis connectivity"        || no "Redis (health.redis)"

# 3. /stats reachable and shaped.
curl -sf "$BASE/stats" 2>/dev/null | grep -q '"founders"' && ok "/stats" || no "/stats"

# 4. HTTP → HTTPS redirect.
code=$(curl -s -o /dev/null -w "%{http_code}" "http://$DOMAIN/" || echo 000)
[ "$code" = "301" ] && ok "HTTP→HTTPS redirect (301)" || no "HTTP→HTTPS redirect (got $code)"

# 5. WebSocket handshake → 101 Switching Protocols.
wscode=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Version: 13" \
  "$BASE/ws/wall" || echo 000)
[ "$wscode" = "101" ] && ok "WebSocket handshake (101)" || no "WebSocket handshake (got $wscode)"

# 6. Google configured — a bogus credential should be REJECTED as invalid, not
#    "not configured" (which means GOOGLE_CLIENT_ID is missing).
G=$(curl -s -X POST "$BASE/auth/google" -H "content-type: application/json" \
      -d '{"credential":"aaa.bbb.ccc"}' 2>/dev/null || true)
if echo "$G" | grep -qi "not configured"; then no "Google Client ID (backend reports 'not configured')"
else ok "Google config present (client id set)"; fi

# 7. Docker container health.
if command -v docker >/dev/null 2>&1; then
  if docker compose ps 2>/dev/null | grep -qiE "unhealthy|exit|restarting"; then
    no "Docker containers ($(docker compose ps 2>/dev/null | grep -iE 'unhealthy|exit|restarting' | awk '{print $1}' | tr '\n' ' '))"
  else ok "Docker containers healthy"; fi
fi

echo
echo "smoke-test: ${pass} passed, ${fail} failed."
[ "$fail" -eq 0 ]
