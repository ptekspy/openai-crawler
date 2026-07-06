#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$PWD}"
INSTALL_DIR="${INSTALL_DIR:-/opt/openai-crawler}"
SERVICE_FILE="/etc/systemd/system/openai-crawler.service"

if [[ $EUID -eq 0 ]]; then
  echo "Run this as your normal WSL user, not root. It will use sudo where needed."
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is not available. Enable WSL systemd first, then run: wsl --shutdown"
  exit 1
fi

sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete --exclude node_modules --exclude data --exclude .auth --exclude .env "$REPO_DIR"/ "$INSTALL_DIR"/
sudo chown -R "$USER:$USER" "$INSTALL_DIR"

cd "$INSTALL_DIR"
corepack enable
pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created $INSTALL_DIR/.env — edit it before exposing the dashboard."
fi

sudo cp ops/systemd/openai-crawler.service "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable openai-crawler.service
sudo systemctl restart openai-crawler.service
systemctl status openai-crawler.service --no-pager
