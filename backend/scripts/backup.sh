#!/usr/bin/env bash
#
# Daily PostgreSQL backup for Founder Wall.
#   • logical dump of the compose `db` container (custom format, compressed)
#   • verifies the dump is a valid, restorable archive
#   • prunes local dumps older than the retention window
#   • optional off-site copy via rclone (if a remote named 'fwoffsite' exists)
#
# Cron (daily 03:00):
#   0 3 * * * /opt/Founder-wall/backend/scripts/backup.sh >> /var/log/fw-backup.log 2>&1
#
# Tunables (env):  FW_BACKUP_DIR, FW_BACKUP_RETENTION_DAYS

set -euo pipefail
cd "$(dirname "$0")/.."          # → backend/ (where docker-compose.yml lives)

# Load POSTGRES_USER / POSTGRES_DB.
[ -f .env ] && { set -a; . ./.env; set +a; }

BACKUP_DIR="${FW_BACKUP_DIR:-/var/backups/founderwall}"
RETENTION_DAYS="${FW_BACKUP_RETENTION_DAYS:-14}"
PGUSER="${POSTGRES_USER:-founder}"
PGDB="${POSTGRES_DB:-founderwall}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/founderwall-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dumping $PGDB -> $FILE"
docker compose exec -T db pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$FILE"

# Verify: a corrupt/incomplete dump must fail the job loudly.
if docker compose exec -T db pg_restore --list < "$FILE" >/dev/null 2>&1; then
  echo "[$(date -Is)] verify OK ($(du -h "$FILE" | cut -f1))"
else
  echo "[$(date -Is)] VERIFY FAILED for $FILE" >&2
  exit 1
fi

# Prune old local backups.
find "$BACKUP_DIR" -name 'founderwall-*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Is)] pruned dumps older than ${RETENTION_DAYS}d"

# Optional off-site copy (configure once: `rclone config` → remote 'fwoffsite').
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^fwoffsite:'; then
  rclone copy "$FILE" fwoffsite:founderwall-backups/ && echo "[$(date -Is)] off-site copy OK"
  # keep off-site in sync with local retention
  rclone delete --min-age "${RETENTION_DAYS}d" fwoffsite:founderwall-backups/ 2>/dev/null || true
fi

echo "[$(date -Is)] backup complete"
