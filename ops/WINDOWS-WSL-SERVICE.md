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

## 2. Install crawler service

From the repo directory inside WSL:

```bash
chmod +x ops/wsl/install-service.sh
ops/wsl/install-service.sh
```

The script installs the app to:

```txt
/opt/openai-crawler
```

Then edit the env file:

```bash
nano /opt/openai-crawler/.env
```

Set a real dashboard password:

```env
CRAWLER_DASHBOARD_MASTER_PASSWORD=use-a-long-random-password
CRAWLER_DASHBOARD_HOST=127.0.0.1
CRAWLER_DASHBOARD_PORT=8788
```

Restart:

```bash
sudo systemctl restart openai-crawler
```

Check logs:

```bash
journalctl -u openai-crawler -f
```

## 3. Install cloudflared

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

Copy the example config:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ops/cloudflared/config.yml.example /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml
```

Replace:

```txt
YOUR_TUNNEL_ID
/etc/cloudflared/YOUR_TUNNEL_ID.json
```

The ingress should point to the crawler dashboard:

```yaml
ingress:
  - hostname: dashboard.paidpolitely.com
    service: http://127.0.0.1:8788
  - service: http_status:404
```

Install cloudflared as a service:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
```

Check logs:

```bash
journalctl -u cloudflared -f
```

## 4. Start WSL services when Windows logs in

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

## 5. Open the dashboard

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
