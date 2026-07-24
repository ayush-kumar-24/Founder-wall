#!/usr/bin/env bash
#
# Lightweight monitor for Founder Wall. No Prometheus/Grafana — just checks +
# state-aware alerting (only notifies on NEW problems and recoveries).
#
# Cron (every 5 min):
#   */5 * * * * /opt/Founder-wall/backend/scripts/monitor.sh >> /var/log/fw-monitor.log 2>&1
#
# Alerts go to $ALERT_WEBHOOK (Slack/Discord/generic JSON). Set it in .env or the
# environment. Tunables: MONITOR_DOMAIN, MONITOR_DISK_WARN(=80),
# MONITOR_MEM_WARN(=90), MONITOR_BACKUP_MAX_AGE_H(=26), MONITOR_5XX_WARN(=20),
# MONITOR_AUTHFAIL_WARN(=15).

set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

DOMAIN="${MONITOR_DOMAIN:-localhost}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
STATE="/var/tmp/fw-monitor.state"
DISK_WARN="${MONITOR_DISK_WARN:-80}"
MEM_WARN="${MONITOR_MEM_WARN:-90}"
BACKUP_DIR="${FW_BACKUP_DIR:-/var/backups/founderwall}"
BACKUP_MAX_AGE_H="${MONITOR_BACKUP_MAX_AGE_H:-26}"

problems=""                         # newline list of "key|message"
add() { problems+="$1|$2"$'\n'; }

notify() {
  echo "[$(date -Is)] ALERT: $1"
  [ -z "$ALERT_WEBHOOK" ] && return 0
  curl -sf -m 10 -H 'Content-Type: application/json' \
    -d "{\"content\":\"[Founder Wall] $1\",\"text\":\"[Founder Wall] $1\"}" \
    "$ALERT_WEBHOOK" >/dev/null 2>&1 || echo "[$(date -Is)] webhook POST failed"
}

# ---- Infrastructure ----
docker info >/dev/null 2>&1 || add docker_daemon "Docker daemon not responding"

for cid in $(docker compose ps -q 2>/dev/null); do
  name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
  state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo '?')
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || echo '')
  rc=$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)
  [ "$state" = "running" ] || add "cont_$name" "Container $name is '$state'"
  [ "$health" = "unhealthy" ] && add "health_$name" "Container $name is unhealthy"
  last=$(grep "^rc_$name=" "$STATE" 2>/dev/null | cut -d= -f2); last=${last:-0}
  if [ "$rc" -gt "$last" ] && [ "$rc" -ge 3 ]; then
    add "loop_$name" "Container $name restart loop (RestartCount=$rc)"
  fi
done

disk=$(df / --output=pcent 2>/dev/null | tr -dc '0-9')
[ -n "${disk:-}" ] && [ "$disk" -ge "$DISK_WARN" ] && add disk "Disk usage ${disk}% (>= ${DISK_WARN}%)"

mem=$(free | awk '/Mem:/ {printf "%d", $3/$2*100}')
[ -n "${mem:-}" ] && [ "$mem" -ge "$MEM_WARN" ] && add memory "Memory usage ${mem}% (>= ${MEM_WARN}%)"

# ---- Application (from inside the api container: DB + Redis + liveness) ----
H=$(docker compose exec -T api curl -sf -m 5 http://localhost:8000/health 2>/dev/null || true)
echo "$H" | grep -q '"database":"ok"' || add db "PostgreSQL check failing (/health)"
echo "$H" | grep -q '"redis":"ok"'    || add redis "Redis check failing (/health)"
docker compose exec -T api curl -sf -m 5 http://localhost:8000/health/live >/dev/null 2>&1 \
  || add liveness "API /health/live not responding"

# WebSocket availability (handshake → 101) through nginx.
ws=$(curl -sk -o /dev/null -w '%{http_code}' -m 8 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H 'Sec-WebSocket-Version: 13' \
  "https://$DOMAIN/ws/wall" 2>/dev/null || echo 000)
[ "$ws" = "101" ] || add websocket "WebSocket handshake not 101 (got $ws)"

# ---- Operational ----
# SSL expiry (30/14/7-day bands) — banded so it doesn't re-alert daily.
end=$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -enddate -noout 2>/dev/null | cut -d= -f2)
if [ -n "${end:-}" ]; then
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  band=""
  if   [ "$days" -le 7  ]; then band=7
  elif [ "$days" -le 14 ]; then band=14
  elif [ "$days" -le 30 ]; then band=30; fi
  [ -n "$band" ] && add cert "SSL certificate expires within ${band} days (renewal may be failing)"
fi

# Backup freshness.
latest=$(ls -t "$BACKUP_DIR"/founderwall-*.dump 2>/dev/null | head -1)
if [ -z "${latest:-}" ]; then
  add backup "No PostgreSQL backup found in $BACKUP_DIR"
else
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ] && add backup "Latest backup is ${age_h}h old (> ${BACKUP_MAX_AGE_H}h)"
fi

# HTTP 5xx rate + failed Google logins in the last 15 min (from nginx logs).
logs=$(docker compose logs --since=15m --no-log-prefix nginx 2>/dev/null || true)
n5xx=$(printf '%s' "$logs" | grep -c '"status":5' || true)
[ "${n5xx:-0}" -gt "${MONITOR_5XX_WARN:-20}" ] && add http5xx "${n5xx} HTTP 5xx responses in last 15m"
nauth=$(printf '%s' "$logs" | grep '/auth/google' | grep -c '"status":401' || true)
[ "${nauth:-0}" -gt "${MONITOR_AUTHFAIL_WARN:-15}" ] && add authfail "${nauth} failed Google logins in last 15m"

# ---- Diff against last run → notify only on changes ----
current=$(printf '%s' "$problems" | grep -v '^$' || true)
current_keys=$(printf '%s\n' "$current" | cut -d'|' -f1 | sort -u | grep -v '^$' || true)
prev_keys=$(grep '^alert:' "$STATE" 2>/dev/null | sed 's/^alert://' | sort -u || true)

# New problems.
while IFS='|' read -r key msg; do
  [ -z "$key" ] && continue
  printf '%s\n' "$prev_keys" | grep -qx "$key" || notify "$msg"
done <<< "$current"

# Recoveries.
for k in $prev_keys; do
  printf '%s\n' "$current_keys" | grep -qx "$k" || notify "RECOVERED: $k"
done

# Persist restart counts + active alert keys.
{
  for cid in $(docker compose ps -q 2>/dev/null); do
    name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
    echo "rc_$name=$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
  done
  for k in $current_keys; do echo "alert:$k"; done
} > "$STATE"

if [ -z "$current" ]; then echo "[$(date -Is)] all checks OK"; else
  echo "[$(date -Is)] active problems:"; printf '  %s\n' "$current"; fi
