#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$PWD}"
INSTALL_DIR="${INSTALL_DIR:-/opt/openai-crawler}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
SERVICE_FILE="/etc/systemd/system/openai-crawler.service"
CLOUDFLARED_CONFIG="/etc/cloudflared/config.yml"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  echo "$value"
}

load_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE. Copy .env.example to .env and fill in required values."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  value="$(trim "$value")"
  [[ -n "$value" ]] || fail "Missing required env var: $name in $ENV_FILE"
  [[ "$value" != "change-this-before-exposing" ]] || fail "$name still has the example value. Set a real value in $ENV_FILE"
}

require_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || fail "Missing required file: $file_path"
}

if [[ $EUID -eq 0 ]]; then
  fail "Run this as your normal WSL user, not root. The script uses sudo where needed."
fi

[[ -d "$REPO_DIR" ]] || fail "Repo directory not found: $REPO_DIR"
[[ -f "$REPO_DIR/package.json" ]] || fail "Repo directory does not look like the crawler repo: $REPO_DIR"

load_env_file

require_env CRAWLER_DASHBOARD_MASTER_PASSWORD
require_env CRAWLER_DASHBOARD_HOST
require_env CRAWLER_DASHBOARD_PORT
require_env CRAWLER_STATE_PATH
require_env REDDIT_AUTH_STATE
require_env CLOUDFLARED_TUNNEL_ID
require_env CLOUDFLARED_TUNNEL_CREDENTIALS_FILE
require_env CLOUDFLARED_HOSTNAME

[[ "${CRAWLER_DASHBOARD_HOST}" == "127.0.0.1" || "${CRAWLER_DASHBOARD_HOST}" == "localhost" ]] || fail "CRAWLER_DASHBOARD_HOST must stay local when using cloudflared. Use 127.0.0.1"
[[ "${CLOUDFLARED_HOSTNAME}" == "dashboard.paidpolitely.com" ]] || fail "CLOUDFLARED_HOSTNAME must be dashboard.paidpolitely.com for this setup"

require_command sudo
require_command systemctl
require_command rsync
require_command corepack
require_command pnpm
require_command cloudflared
require_file "$CLOUDFLARED_TUNNEL_CREDENTIALS_FILE"

if ! systemctl --version >/dev/null 2>&1; then
  fail "systemd is not available. Copy ops/wsl/wsl.conf.example to /etc/wsl.conf, then run 'wsl --shutdown' from Windows."
fi

info "Installing crawler to $INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude data \
  --exclude .auth \
  --exclude .env \
  "$REPO_DIR"/ "$INSTALL_DIR"/
sudo chown -R "$USER:$USER" "$INSTALL_DIR"

info "Installing runtime dependencies"
cd "$INSTALL_DIR"
corepack enable
pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium

info "Installing environment file"
install -m 600 "$ENV_FILE" "$INSTALL_DIR/.env"

info "Creating local runtime directories"
mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/.auth"
chmod 700 "$INSTALL_DIR/data" "$INSTALL_DIR/.auth"

info "Installing crawler systemd service"
sudo cp "$INSTALL_DIR/ops/systemd/openai-crawler.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable openai-crawler.service
sudo systemctl restart openai-crawler.service

info "Writing cloudflared config to $CLOUDFLARED_CONFIG"
sudo mkdir -p /etc/cloudflared
sudo tee "$CLOUDFLARED_CONFIG" >/dev/null <<YAML
tunnel: ${CLOUDFLARED_TUNNEL_ID}
credentials-file: ${CLOUDFLARED_TUNNEL_CREDENTIALS_FILE}

protocol: http2

ingress:
  - hostname: ${CLOUDFLARED_HOSTNAME}
    service: http://${CRAWLER_DASHBOARD_HOST}:${CRAWLER_DASHBOARD_PORT}
  - service: http_status:404
YAML
sudo chmod 600 "$CLOUDFLARED_CONFIG"

info "Installing and restarting cloudflared service"
if ! systemctl list-unit-files | grep -q '^cloudflared.service'; then
  sudo cloudflared service install || true
fi
sudo systemctl enable cloudflared.service
sudo systemctl restart cloudflared.service

info "Setup complete"
echo "Crawler service:   systemctl status openai-crawler --no-pager"
echo "Cloudflared:       systemctl status cloudflared --no-pager"
echo "Crawler logs:      journalctl -u openai-crawler -f"
echo "Cloudflared logs:  journalctl -u cloudflared -f"
echo "Dashboard:         https://${CLOUDFLARED_HOSTNAME}"
