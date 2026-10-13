#!/usr/bin/env bash
# Installs/updates Niramoy Pharmacy in /var/www/html/niramoy-web on port 4000.
# Expects deploy.tar (dist, server, scripts, and optionally public/ images) in
# $APP and niramoy-web.service next to this script. All data lives in MySQL
# (run mysql-setup.sh once first); images stay in public/img.
set -euo pipefail

APP=/var/www/html/niramoy-web
PORT=4000
ENV_FILE=/etc/niramoy-web.env
UNIT=niramoy-web.service

cd "$APP"

if ! grep -q '^MYSQL_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
  echo "$ENV_FILE has no MySQL settings - run mysql-setup.sh first." >&2
  exit 1
fi

if ss -ltn "( sport = :$PORT )" | grep -q LISTEN && ! systemctl is-active --quiet "$UNIT"; then
  echo "Port $PORT is already used by another process - aborting." >&2
  exit 1
fi

tar -xf deploy.tar
rm -f deploy.tar package-lock.json

# Runtime-only manifest: the dev toolchain (vite, tsc, tailwind) is not needed
# on the server. better-sqlite3 is only used by scripts/sqlite-to-mysql.mjs to
# load a freshly harvested catalogue; 11.x has no build for Node 25.
cat > package.json <<'JSON'
{
  "name": "niramoy-web",
  "private": true,
  "type": "module",
  "dependencies": {
    "better-sqlite3": "^12.4.1",
    "express": "^4.21.0",
    "mysql2": "^3.24.5"
  }
}
JSON
npm install --omit=dev --no-audit --no-fund

if ! grep -q '^ADMIN_PASSWORD=' "$ENV_FILE"; then
  echo "ADMIN_EMAIL=admin@niramoy.local" >> "$ENV_FILE"
  echo "ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')" >> "$ENV_FILE"
  echo "Added a generated admin password to $ENV_FILE."
fi
chmod 600 "$ENV_FILE"

chown -R www-data:www-data "$APP"

# First run after the SQLite -> MySQL switch: copy data/*.db into MySQL before
# the server boots against empty tables. A no-op once MySQL holds data.
if [ -f data/arogga.db ]; then
  systemctl stop "$UNIT" 2>/dev/null || true
  (set -a; . "$ENV_FILE"; set +a; node scripts/sqlite-to-mysql.mjs --if-empty)
fi

install -m 644 "$(dirname "$0")/$UNIT" "/etc/systemd/system/$UNIT"
systemctl daemon-reload
systemctl enable "$UNIT" >/dev/null
systemctl restart "$UNIT"

ufw status | grep -q "^$PORT/tcp" || ufw allow "$PORT/tcp"

sleep 3
systemctl --no-pager --lines=8 status "$UNIT" || true
curl -fsS -o /dev/null -w "local check: HTTP %{http_code}\n" "http://127.0.0.1:$PORT/api/categories"
