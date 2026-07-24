#!/usr/bin/env bash
#
# One-time Let's Encrypt bootstrap for Founder Wall.
# Solves the chicken-and-egg (nginx needs a cert to start :443, certbot needs
# nginx serving :80 to answer the ACME challenge) by:
#   1. starting the backend services,
#   2. dropping a THROWAWAY self-signed cert so nginx can start on :443,
#   3. starting nginx (it now serves the ACME webroot on :80),
#   4. deleting the dummy cert and issuing the REAL one over webroot,
#   5. reloading nginx, then handing renewals to the certbot service.
#
# Run this ONCE on the VPS after DNS for your domain points at the server.
# Subsequent renewals are automatic (the certbot + nginx services handle them).

set -euo pipefail

# ── EDIT THESE ────────────────────────────────────────────────────────────
DOMAIN="founderwall.example.com"     # your real domain (A record → this VPS)
EMAIL="you@example.com"              # for expiry notices
STAGING=0                            # 1 = Let's Encrypt STAGING (test, no rate
                                     #     limits). Verify, then set 0 and rerun.
# ──────────────────────────────────────────────────────────────────────────

COMPOSE="docker compose"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "==> [0/6] Pre-flight: DNS for $DOMAIN must resolve to THIS server."
echo "         (Ctrl-C now if it doesn't — ACME validation will fail otherwise.)"
sleep 3

echo "==> [1/6] Building and starting backend services (db, redis, api, web, adminer)…"
$COMPOSE up -d --build db redis api web adminer

echo "==> [2/6] Creating a throwaway self-signed cert so nginx can boot :443…"
$COMPOSE run --rm --entrypoint sh certbot -c "
  mkdir -p '$CERT_PATH' &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out    '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'"

echo "==> [3/6] Starting nginx (now serving the ACME challenge on :80)…"
$COMPOSE up -d nginx
sleep 5

echo "==> [4/6] Removing the dummy cert…"
$COMPOSE run --rm --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$DOMAIN \
         /etc/letsencrypt/archive/$DOMAIN \
         /etc/letsencrypt/renewal/$DOMAIN.conf"

echo "==> [5/6] Requesting the real certificate from Let's Encrypt…"
STAGING_ARG=""
[ "$STAGING" -eq 1 ] && STAGING_ARG="--staging"
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  $STAGING_ARG \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --rsa-key-size 4096 \
  --agree-tos --no-eff-email --non-interactive --force-renewal

echo "==> [6/6] Reloading nginx with the real certificate…"
$COMPOSE exec nginx nginx -s reload

echo
echo "Done. Certificate installed for $DOMAIN."
echo "Start the auto-renewal daemon:   $COMPOSE up -d certbot"
echo "Verify:                          curl -I https://$DOMAIN/health/live"
