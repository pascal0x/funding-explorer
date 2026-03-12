#!/usr/bin/env bash
# Run this script on the server as root to deploy funding-explorer
# Usage: bash deploy/setup.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 1. Build frontend ==="
cd "$REPO_DIR"
npm install
npm run build

echo "=== 2. Install static files ==="
mkdir -p /var/www/funding-explorer
cp -r dist/* /var/www/funding-explorer/

echo "=== 3. Install backend dependencies ==="
cd "$REPO_DIR/server"
npm install --omit=dev

echo "=== 4. Configure nginx ==="
cp "$REPO_DIR/deploy/nginx.conf" /etc/nginx/sites-available/funding-explorer
ln -sf /etc/nginx/sites-available/funding-explorer /etc/nginx/sites-enabled/funding-explorer
# Disable default site if present
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== 5. Install systemd service ==="
# Ensure PostgreSQL is running
pg_ctlcluster 16 main start 2>/dev/null || true
systemctl enable postgresql 2>/dev/null || true

cp "$REPO_DIR/deploy/funding-server.service" /etc/systemd/system/funding-server.service
systemctl daemon-reload
systemctl enable funding-server
systemctl restart funding-server

echo ""
echo "=== Done! ==="
echo "Backend : systemctl status funding-server"
echo "Logs    : journalctl -u funding-server -f"
echo "nginx   : systemctl status nginx"
echo "API     : curl http://localhost/api/status"
