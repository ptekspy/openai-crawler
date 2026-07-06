# OpenAI Crawler

A Playwright-based Reddit crawler worker for the `ptekspy/rdaresgonewild` data pipeline.

The goal is to remove the browser extension and replace it with a server-side browser worker that can:

- keep an authenticated Reddit browser session
- crawl priority subreddits on `best` and `new`
- crawl Reddit home on `best` and `new`
- fetch extra subreddit/user targets from an API when available
- fall back to configured local targets when the API is not ready
- capture Reddit network JSON payloads first
- fall back to DOM extraction if needed
- send normalized crawl results to your API, or log dry-run results locally

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

## Save Reddit login session

Run this once locally:

```bash
pnpm login
```

A visible Chromium window opens. Log in to Reddit manually, then press Enter in the terminal.

This saves the browser session to:

```txt
.auth/reddit.json
```

That file is intentionally ignored by git.

## Run one crawler cycle

```bash
pnpm crawl:once
```

## Run continuously

```bash
pnpm crawl
```

## Editable priority targets

The default 10 priority targets live in:

```txt
config/default-tasks.json
```

Current defaults:

```json
[
  "daresgonewild",
  "ChangingInPublic",
  "OnlyOneNaked",
  "RealGirls",
  "normalnudes",
  "gonewild",
  "ratemyboobs",
  "progresspics",
  "amiugly",
  "selfie"
]
```

You can also override/add targets from `.env`:

```env
CRAWLER_PRIORITY_SUBREDDITS=["daresgonewild","ChangingInPublic"]
CRAWLER_EXTRA_SUBREDDITS=someSub,anotherSub
CRAWLER_EXTRA_USERS=someUser,anotherUser
```

## API handoff

If `CRAWLER_API_URL` is empty, the worker runs in dry-run mode.

When configured, it calls:

```txt
GET  {CRAWLER_API_URL}{CRAWLER_API_TARGETS_PATH}
POST {CRAWLER_API_URL}{CRAWLER_API_IMPORT_PATH}
```

Defaults:

```env
CRAWLER_API_TARGETS_PATH=/api/crawler/targets
CRAWLER_API_IMPORT_PATH=/api/crawler/import
```

Expected targets response shape:

```json
{
  "subreddits": ["daresgonewild"],
  "users": ["SomeRedditUser"]
}
```

Import payload shape:

```ts
interface CrawlResult {
  task: CrawlTask;
  startedAt: string;
  finishedAt: string;
  payloadCount: number;
  posts: NormalizedPost[];
  errors: string[];
}
```

## Environment

See `.env.example` for all options.

Important ones:

```env
REDDIT_AUTH_STATE=.auth/reddit.json
CRAWLER_HEADLESS=true
CRAWLER_SCROLL_STEPS=8
CRAWLER_SCROLL_DELAY_MS=1200
CRAWLER_TASK_DELAY_MS=5000
CRAWLER_CYCLE_DELAY_MS=300000
CRAWLER_API_URL=
CRAWLER_API_TOKEN=
```

## Do we need Reddit HTML?

Not initially.

The crawler prioritises Reddit's network JSON responses because that is usually less fragile than scraping visible cards from the page.

Reddit HTML is useful only if:

- the normalizer misses fields you care about
- the network payload changes
- a subreddit page renders data that is not present in captured JSON
- we need to tune the DOM fallback selectors

A saved sample from one loaded subreddit page would be useful later, but it is not required for this first version.

## Notes

Keep crawl delays conservative. This is a browser worker, not a high-volume scraper. It should behave like a logged-in user browsing pages at a reasonable pace.
