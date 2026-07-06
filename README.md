# OpenAI Crawler

A local autonomous Playwright Reddit crawler for the `ptekspy/rdaresgonewild` / Paid Politely pipeline.

It replaces the browser extension with:

- a persistent local state file
- a local monitoring dashboard
- configurable main subreddits
- multiple account crawler instances
- a shared task queue so accounts do not duplicate work
- scheduled main-target crawling
- idle discovery crawling across users and verified NSFW subreddits
- graph ingestion: posts -> users -> posts -> subreddits -> more posts/users

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

## Run locally

```bash
pnpm crawl
```

Dashboard:

```txt
http://127.0.0.1:8788
```

## Run always-on in WSL

Use the WSL/systemd + Cloudflare Tunnel guide:

```txt
ops/WINDOWS-WSL-SERVICE.md
```

This installs the crawler as a systemd service and exposes the protected dashboard at:

```txt
https://dashboard.paidpolitely.com
```

The dashboard uses a single master password from:

```env
CRAWLER_DASHBOARD_MASTER_PASSWORD=use-a-long-random-password
```

## Dashboard

The dashboard lets you:

- add accounts
- add a Reddit session cookie account
- enable/disable accounts
- add/enable/disable main subreddits
- watch queue, runs, accounts and graph counts

## Main subreddit schedule

For Reddit home and all enabled main subreddits:

```txt
best: daily at noon UTC
new: every hour
```

Subreddit details are scheduled at least once per day.

If an account has no due main work, it claims discovery work:

```txt
candidate subreddit details -> verified NSFW subreddits -> subreddit new feeds -> discovered user submitted pages
```

## NSFW-only subreddit tracking

The crawler does not promote a discovered subreddit into the tracked subreddit set until subreddit details show `over18: true`.

Unknown subreddits first go into `subredditCandidates` and get a details task. If details show `over18: false`, the candidate is rejected.

## Account auth

You can add accounts from the dashboard with either:

```txt
username + password field
reddit_session cookie
```

The current production-safe path is the `reddit_session` cookie or the manual login state from:

```bash
pnpm login
```

Manual login saves:

```txt
.auth/reddit.json
```

Local state is saved to:

```txt
data/state.json
```

Both are ignored by git.

## Editable main targets

The default targets live in:

```txt
config/default-tasks.json
```

You can also override the main list from `.env`:

```env
CRAWLER_PRIORITY_SUBREDDITS=["daresgonewild","ChangingInPublic"]
```

## HTML snapshots

Only needed for debugging/tuning selectors:

```bash
pnpm snapshot https://www.reddit.com/r/daresgonewild/new/
```

Snapshots are saved to `snapshots/` and ignored by git.

## Important env

```env
CRAWLER_STATE_PATH=data/state.json
CRAWLER_DASHBOARD_HOST=127.0.0.1
CRAWLER_DASHBOARD_PORT=8788
CRAWLER_DASHBOARD_MASTER_PASSWORD=use-a-long-random-password
REDDIT_AUTH_STATE=.auth/reddit.json
CRAWLER_HEADLESS=true
CRAWLER_SCROLL_STEPS=8
CRAWLER_SCROLL_DELAY_MS=1200
CRAWLER_TASK_DELAY_MS=5000
```

## API handoff

If `CRAWLER_API_URL` is empty, the worker logs/dry-runs locally.

When configured, it calls:

```txt
GET  {CRAWLER_API_URL}{CRAWLER_API_TARGETS_PATH}
POST {CRAWLER_API_URL}{CRAWLER_API_IMPORT_PATH}
```

The local dashboard and queue work without the API.
