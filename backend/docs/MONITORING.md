# Founder Wall — Monitoring (lightweight)

No Prometheus/Grafana. A single cron-driven script (`scripts/monitor.sh`) runs
the checks and alerts on **state changes only** (new problem + recovery), so you
get high signal with near-zero noise. Docker's own `restart: unless-stopped` +
health checks do the automatic recovery; the monitor tells you when something
needed it.

---

## What is watched
**Infrastructure:** Docker daemon up · each container's `State.Status` &
`Health` · **restart loops** (`RestartCount` rising ≥3) · **disk %** (≥80) ·
**memory %** (≥90). CPU/load and volume sizes are available via the manual
commands below (not alerted by default — low value on a single VPS).

**Application:** `/health` (**PostgreSQL** + **Redis** checks) · `/health/live` ·
**WebSocket** handshake (expects `101`).

**Operational:** **SSL expiry** (30/14/7-day bands — an alert here means
auto-renewal is failing, since certbot renews at 30 days) · **backup freshness**
(alerts if the latest dump is > 26 h old or missing) · **HTTP 5xx rate** and
**failed Google logins** in the last 15 min (parsed from nginx JSON logs).

---

## Setup
```bash
# 1. Set the alert webhook (Slack / Discord / generic). In backend/.env:
#    ALERT_WEBHOOK=https://discord.com/api/webhooks/xxx/yyy      (Discord)
#    ALERT_WEBHOOK=https://hooks.slack.com/services/xxx/yyy/zzz  (Slack)
#    MONITOR_DOMAIN=your-domain.com
# (the payload sends both {"content":…} and {"text":…} so either works)

# 2. Schedule it:
chmod +x scripts/monitor.sh
( crontab -l 2>/dev/null; \
  echo "*/5 * * * * /opt/Founder-wall/backend/scripts/monitor.sh >> /var/log/fw-monitor.log 2>&1" \
) | crontab -
```
Alerts fire for: **backup failure, container unhealthy, SSL renewal failure,
disk nearly full, restart loops** — plus DB/Redis/WebSocket/liveness/5xx/auth
spikes. Each clears with a `RECOVERED: <key>` message.

---

## First-line troubleshooting (logs)
Logs are JSON, rotated by the compose driver (10 MB × 5 per container).
```bash
docker compose logs --since=1h api        # recent backend
docker compose logs --tail=200 nginx      # last 200 edge lines
docker compose logs -f web                # follow the frontend
docker compose logs --since=15m           # everything, last 15 min
docker compose ps                         # status + health at a glance
```

## Manual health / resource checks
```bash
docker stats --no-stream                              # live CPU / RAM per container
docker system df                                      # image/volume/disk usage
docker volume ls                                      # named volumes
df -h /                                                # disk
free -h                                                # memory
uptime                                                 # load average
docker inspect -f '{{.RestartCount}}' $(docker compose ps -q api)   # restart count
docker compose run --rm --entrypoint certbot certbot certificates   # cert expiry
./scripts/smoke-test.sh your-domain.com               # full app check
tail -f /var/log/fw-monitor.log                       # monitor output
```

## Alerting channels
Any webhook-capable channel works via `ALERT_WEBHOOK`: **Discord** and **Slack**
incoming webhooks are the simplest (paste the URL); **Telegram** works by
pointing the URL at a small relay or using a generic bot webhook; **email** via a
webhook-to-email service. Keep the alert set tight (the five above) so a
notification always means "look now."

## Escalation path (recommended)
1. Alert arrives → check `docker compose ps` and the relevant service logs.
2. Restart the affected service: `docker compose restart <service>`.
3. If unhealthy after restart → check dependencies (db/redis healthy?) and disk.
4. Data problem → see `BACKUP_DR.md` restore procedure.
5. Certificate → `init-letsencrypt.sh` path / check DNS + port 80 reachability.
