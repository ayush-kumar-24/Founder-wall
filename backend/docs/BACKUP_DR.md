# Founder Wall — Backups & Disaster Recovery

The **source of truth is PostgreSQL** (users, notes, moderation). Redis holds
only transient/reconstructable state. So the backup strategy centres on Postgres
logical dumps, with volume backups as a secondary safety net.

---

## 1. Automated PostgreSQL backups
`scripts/backup.sh` runs a compressed, **verified** `pg_dump` and prunes old
copies. Schedule it with cron on the VPS:

```bash
sudo mkdir -p /var/backups/founderwall
( crontab -l 2>/dev/null; \
  echo "0 3 * * * /opt/Founder-wall/backend/scripts/backup.sh >> /var/log/fw-backup.log 2>&1" \
) | crontab -
```
- **Retention:** 14 days locally (`FW_BACKUP_RETENTION_DAYS`).
- **Verification:** each dump is checked with `pg_restore --list`; a bad dump
  fails the job (non-zero exit → visible in the log / cron mail).
- **Frequency vs RPO:** daily = up to 24 h of potential loss. For a tighter RPO,
  run it every 6 h (`0 */6 * * *`).

## 2. Off-site storage (strongly recommended)
A backup on the same VPS dies with the VPS. Push dumps off-box:

```bash
sudo apt -y install rclone
rclone config          # create a remote named 'fwoffsite'
                       # (Backblaze B2, AWS S3, Cloudflare R2, GDrive, etc.)
```
Once `fwoffsite:` exists, `backup.sh` copies each dump there automatically and
mirrors the retention window. **Test a restore FROM off-site at least once.**

## 3. Docker volume backup (secondary)
The logical dump above is the primary DB backup (portable + verifiable). For a
full-state snapshot you can also archive the named volumes:

```bash
# Postgres data (redundant with pg_dump, but a fast whole-cluster snapshot):
docker run --rm -v backend_pgdata:/v -v "$PWD":/out alpine \
  tar czf /out/pgdata-$(date +%F).tgz -C /v .
# TLS certs (avoids re-issuance / rate limits on a rebuild):
docker run --rm -v backend_certbot_etc:/v -v "$PWD":/out alpine \
  tar czf /out/certs-$(date +%F).tgz -C /v .
```
(Volume names are `<project>_<volume>`, e.g. `backend_pgdata`; confirm with
`docker volume ls`.)

## 4. Redis persistence & recovery expectations
- Redis runs with **AOF** (`--appendonly yes`) on the `redisdata` volume, so it
  survives container restarts.
- **Redis is NOT a backup priority.** Its contents are transient or
  reconstructable: pub/sub messages are ephemeral, presence keys are TTL'd and
  rebuild as clients reconnect, and the thoughts counter is **reconciled from
  Postgres** by the stats service. Total Redis loss ⇒ counters/presence
  self-heal from the database and reconnections; **no note or user data is lost**
  (that lives in Postgres).

## 5. Restore procedures (test these periodically)
**Restore the database from a dump:**
```bash
cd /opt/Founder-wall/backend
docker compose stop web api                 # maintenance mode (no writes)
docker compose exec -T db pg_restore -U founder -d founderwall \
  --no-owner --clean --if-exists < /var/backups/founderwall/founderwall-YYYYMMDD-HHMMSS.dump
docker compose start api
docker compose exec -T db psql -U founder -d founderwall \
  -c "select count(*) from users; select count(*) from notes;"   # sanity
docker compose start web                    # lift maintenance
./scripts/smoke-test.sh your-domain.com
```
**Quarterly restore drill:** restore the latest dump into a throwaway DB and run
the count/sanity checks — a backup you've never restored is not a backup.

## 6. RPO / RTO targets
| Metric | Target | Driver |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h (daily) — or ≤ 6 h if you run backup.sh 4×/day | backup frequency |
| **RTO — database corruption** | ~5–15 min | stop → `pg_restore` → start → smoke-test |
| **RTO — total VPS loss** | ~30–60 min | provision VPS → runbook §1–8 → restore latest off-site dump → DNS |

## 7. Disaster recovery checklists

### A. Database corruption / accidental data loss
1. `docker compose stop web api` (maintenance page shows).
2. Identify the latest **verified** dump (local or off-site).
3. `pg_restore --clean --if-exists` it into `db` (§5).
4. Start `api`, run sanity counts, then start `web`.
5. `./scripts/smoke-test.sh your-domain.com`.

### B. Complete VPS loss
1. Provision a **fresh Ubuntu VPS**; complete runbook **§1–5** (prep, Docker,
   clone, `.env`, domain).
2. **Restore the latest off-site dump** — bring up `db` only
   (`docker compose up -d db`), wait healthy, then `pg_restore` the dump.
   *(If you also saved the certs volume, restore it to skip re-issuance;
   otherwise re-run `init-letsencrypt.sh`.)*
3. `docker compose up -d --build` (api runs migrations — already at head).
4. Point DNS at the new VPS IP.
5. `./scripts/smoke-test.sh your-domain.com` → confirm all green.

### C. Losing access to the VPS (locked out) — prevention
- Keep the repo + `.env` (or its secrets) in a **secure secrets manager**,
  not only on the VPS. Losing `.env` means regenerating `JWT_SECRET` (invalidates
  all sessions — users just re-login) and `POSTGRES_PASSWORD` (must match the
  restored data's role or use `--no-owner`).

---

## Backup health — verify it's actually working
- `tail /var/log/fw-backup.log` shows `verify OK` daily.
- `ls -lh /var/backups/founderwall/` shows rolling dumps.
- Off-site: `rclone ls fwoffsite:founderwall-backups/`.
- **Do a real restore drill each quarter.**
