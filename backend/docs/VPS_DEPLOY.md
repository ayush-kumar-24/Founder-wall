# Founder Wall — Hostinger VPS Deployment Runbook

Run these steps top-to-bottom on a **clean Ubuntu 22.04/24.04 Hostinger VPS**.
Everything runs in Docker Compose: nginx + Next.js + FastAPI + PostgreSQL +
Redis + Adminer + Certbot. **No application code changes** — infra + env only.

You need: the **VPS IP**, a **domain** you control, and your current **Railway
`DATABASE_URL`** (for the data migration).

---

## 0. Prerequisites
- DNS access for your domain.
- Your Google OAuth **Client ID** (same one already in use).
- Keep Render/Vercel/Railway **running** until cutover is verified (rollback).

---

## 1. Initial server preparation
SSH in as root (Hostinger gives you root + password), then:

```bash
# Update the system
apt update && apt -y upgrade

# Create a non-root sudo user and add your SSH key
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/    # copy your key

# Firewall: allow only SSH + HTTP + HTTPS
apt -y install ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# (Recommended) SSH hardening — only after you've confirmed key login works:
#   /etc/ssh/sshd_config →  PermitRootLogin no ; PasswordAuthentication no
#   systemctl restart ssh
# (Optional) brute-force protection:
apt -y install fail2ban
```

From here on, work as the `deploy` user (`ssh deploy@VPS_IP`).

---

## 2. Install Docker + Compose plugin
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # then log out/in so `docker` works sans sudo
docker --version && docker compose version
```

---

## 3. Clone the repository
```bash
git clone https://github.com/<you>/Founder-wall.git
cd Founder-wall/backend        # docker-compose.yml lives here
```

---

## 4. Configure `.env`
```bash
cp .env.example .env
# generate the secrets:
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
echo "JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')"
nano .env      # paste those, set GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_CLIENT_ID
               # (SAME value), CORS_ORIGINS=https://your-domain.com

# Preflight — fails fast if anything required is missing/weak/mismatched:
chmod +x scripts/check-env.sh init-letsencrypt.sh
./scripts/check-env.sh
```

---

## 5. Set your domain
Replace `founderwall.example.com` in **`nginx/nginx.conf` (4 places)** and set
`DOMAIN`/`EMAIL` in **`init-letsencrypt.sh`**:
```bash
sed -i 's/founderwall\.example\.com/your-domain.com/g' nginx/nginx.conf
nano init-letsencrypt.sh     # set DOMAIN, EMAIL
```
**Tip:** during the first bring-up, comment the `Strict-Transport-Security`
(HSTS) line in `nginx/nginx.conf` — re-enable it after HTTPS is confirmed.

---

## 6. DNS: point the domain at the VPS **now**
Create an **A record**: `your-domain.com → VPS_IP` (and `www` if you use it).
Wait until it resolves (`dig +short your-domain.com` returns the VPS IP) — the
Let's Encrypt challenge needs it.

---

## 7. Issue the TLS certificate
```bash
# Test against staging first (avoids rate limits): set STAGING=1 in the script
./init-letsencrypt.sh
# If it succeeds, set STAGING=0 in the script and run again for the real cert:
./init-letsencrypt.sh
```

---

## 8. Start the full stack
```bash
docker compose up -d --build
docker compose ps            # all services Up / healthy
docker compose up -d certbot # ensure the renewal daemon is running
```
The `api` container runs `alembic upgrade head` on start, so the schema is
created automatically (empty) before you restore data.

---

## 9. Migrate the database from Railway (Postgres → Postgres, clean copy)
Do this during a brief **maintenance window** (before DNS traffic arrives, or
put up a notice). The dump includes schema + data + `alembic_version`, so the
versions stay consistent.

```bash
# 9a. Dump the live Railway DB (use YOUR railway URL; note: postgresql://, not +asyncpg)
pg_dump "postgresql://postgres:<pw>@yamabiko.proxy.rlwy.net:19247/railway" \
  -Fc --no-owner -f fw.dump
#   (install client if needed:  sudo apt -y install postgresql-client)

# 9b. MAINTENANCE MODE: stop web + api → nginx serves the maintenance page and
#     no writes can land during the restore (see nginx @maintenance).
docker compose stop web api

# 9c. Restore into the VPS Postgres container
docker compose exec -T db pg_restore -U founder -d founderwall \
  --no-owner --clean --if-exists < fw.dump

# 9d. Bring the api back and verify BEFORE lifting maintenance
docker compose start api
docker compose exec -T db psql -U founder -d founderwall \
  -c "select count(*) users from users; select count(*) notes from notes;"

# 9e. Lift maintenance (start the frontend again)
docker compose start web
```

**Recommended cutover order (minimises split-brain during DNS propagation):**
enable maintenance (9b) → final dump (9a) → restore (9c) → start api + verify
(9d) → lift maintenance (9e) → **then switch DNS**. Because the Railway DB is
only *read*, the old stack still serves live data if you must roll back. Note:
to fully eliminate split-brain you'd also quiesce the old stack; with a low DNS
TTL (300s) and taking the final dump immediately before the switch, the window
is small.

---

## 10. Final verification
```bash
# Automated smoke test (run this first — it covers most of the below):
./scripts/smoke-test.sh your-domain.com

DOMAIN=your-domain.com

# HTTPS + redirect
curl -sI https://$DOMAIN/health/live         # 200, valid cert
curl -sI http://$DOMAIN/ | grep -i location  # 301 → https

# Backend health (DB + Redis)
curl -s https://$DOMAIN/health                # {"status":"ok","checks":{"database":"ok","redis":"ok"}}

# Security headers
curl -sI https://$DOMAIN/ | grep -Ei 'strict-transport|x-content-type|referrer'

# Data present
curl -s https://$DOMAIN/stats                 # founders/thoughts reflect migrated data

# Containers healthy
docker compose ps
```
In a browser at `https://$DOMAIN`:
- **Frontend** loads (paper wall, notes render).
- **WebSocket:** DevTools ▸ Network ▸ `ws/wall` → **101** over `wss`.
- **Google Sign-In:** real button renders (domain must be in Google Cloud
  Authorized JS Origins — Phase 7), sign-in completes, `POST /auth/google → 200`.
- **Realtime sync:** post a note in one browser → it appears live in a second
  browser (Redis pub/sub fan-out).
- **Adminer** (optional): `ssh -L 8080:localhost:8080 deploy@VPS_IP` after
  uncommenting the localhost bind → http://localhost:8080 (server `db`).

---

## 11. Cutover & cleanup
- Once verified, keep the **Vercel origin in Google Cloud temporarily** (rollback),
  then remove it after a few stable days.
- Point any remaining DNS (apex/www) at the VPS.

---

## 12. Rollback (if a blocking issue appears mid-cutover)
Because Render/Vercel/Railway are left running until you're confident:
1. **Revert DNS**: point `your-domain.com` back to the **Vercel** frontend
   (and the app's `NEXT_PUBLIC_API_URL` back to the Render/Railway backend if you
   had repointed it). DNS TTL should be low (300s) during cutover for fast revert.
2. The **Railway database is untouched** by the migration (you only *dumped* from
   it, never wrote to it) — so the old stack keeps working with live data.
3. Investigate on the VPS with `docker compose logs -f <service>`; fix; retry the
   cutover.
4. Only decommission Render/Vercel/Railway after the VPS has run clean for a few
   days.

---

## Day-2 operations
- Logs: `docker compose logs -f api` (rotated, 10 MB × 5 per container).
- Restart a service: `docker compose restart api`.
- Update: `git pull && docker compose up -d --build`.
- Cert status: `docker compose run --rm --entrypoint certbot certbot certificates`.
- Backups & monitoring: Phases 10–11.
