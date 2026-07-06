# WSL always-on service + Cloudflare Tunnel

This setup runs the crawler inside WSL using systemd and exposes the local dashboard through Cloudflare Tunnel at:

```txt
dashboard.paidpolitely.com
```

The dashboard is protected by one master password using HTTP Basic Auth.

## 1. Enable systemd in WSL

Inside the WSL distro:

```bash
sudo cp ops/wsl/wsl.conf.example /etc/wsl.conf
```

From Windows PowerShell:

```powershell
wsl --shutdown
```

Start WSL again and check:

```bash
systemctl --version
```

## 2. Prepare `.env`

From the repo directory inside WSL:

```bash
cp .env.example .env
nano .env
```

The full setup script fails if any of these are missing or still using placeholder values:

```env
CRAWLER_DASHBOARD_MASTER_PASSWORD=use-a-long-random-password
CRAWLER_DASHBOARD_HOST=127.0.0.1
CRAWLER_DASHBOARD_PORT=8788
CRAWLER_STATE_PATH=data/state.json
REDDIT_AUTH_STATE=.auth/reddit.json
CLOUDFLARED_TUNNEL_ID=your-tunnel-id
CLOUDFLARED_TUNNEL_CREDENTIALS_FILE=/etc/cloudflared/tunnel-credentials.json
CLOUDFLARED_HOSTNAME=dashboard.paidpolitely.com
```

## 3. Create the Cloudflare Tunnel credentials

Install cloudflared in WSL using Cloudflare's current Linux instructions, then authenticate:

```bash
cloudflared tunnel login
```

Create the tunnel:

```bash
cloudflared tunnel create paid-politely-dashboard
```

Route the hostname:

```bash
cloudflared tunnel route dns paid-politely-dashboard dashboard.paidpolitely.com
```

Make sure `CLOUDFLARED_TUNNEL_ID` and `CLOUDFLARED_TUNNEL_CREDENTIALS_FILE` in `.env` match the tunnel you created.

## 4. Run the full setup

```bash
chmod +x ops/wsl/setup-all.sh
ops/wsl/setup-all.sh
```

The script will:

- validate required env vars
- fail if the dashboard password is still the example value
- fail if the dashboard is not bound to loopback
- fail if `cloudflared` or the tunnel credentials file are missing
- install the app to `/opt/openai-crawler`
- install dependencies and Playwright Chromium
- install/restart the `openai-crawler` systemd service
- write `/etc/cloudflared/config.yml`
- install/restart the `cloudflared` systemd service

## 5. Start WSL services when Windows logs in

Systemd keeps the crawler alive while the WSL distro is running. To wake the distro on Windows login, run this from Windows PowerShell in the repo:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\ops\windows\register-wsl-startup-task.ps1
```

The task starts:

```txt
openai-crawler
cloudflared
```

## 6. Open the dashboard

Go to:

```txt
https://dashboard.paidpolitely.com
```

When prompted:

```txt
username: admin
password: value of CRAWLER_DASHBOARD_MASTER_PASSWORD
```

The username is ignored; only the password is checked.

## Useful service commands

```bash
sudo systemctl status openai-crawler
sudo systemctl restart openai-crawler
sudo systemctl stop openai-crawler
journalctl -u openai-crawler -f

sudo systemctl status cloudflared
sudo systemctl restart cloudflared
journalctl -u cloudflared -f
```

## Security notes

Keep the crawler dashboard bound to loopback:

```env
CRAWLER_DASHBOARD_HOST=127.0.0.1
```

Only cloudflared should expose it publicly. Do not commit `.env`, `.auth/`, or `data/`.
