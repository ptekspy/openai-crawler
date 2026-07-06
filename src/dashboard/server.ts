import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { logger } from "../logger.js";
import type { CrawlerConfig } from "../types.js";
import type { StateStore } from "../state/store.js";
import { dashboardHtml } from "./html.js";

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function text(res: ServerResponse, status: number, payload: string, contentType = "text/plain") {
  res.writeHead(status, { "content-type": contentType });
  res.end(payload);
}

function publicState(store: StateStore) {
  const state = store.snapshot;
  const accounts = Object.values(state.accounts).map((account) => ({
    id: account.id,
    label: account.label,
    username: account.username,
    enabled: account.enabled,
    status: account.status,
    currentTaskId: account.currentTaskId,
    lastRunAt: account.lastRunAt,
    lastError: account.lastError,
    hasSessionCookie: Boolean(account.sessionCookie),
    hasLoginSecret: Boolean(account.loginSecret),
    hasAuthStatePath: Boolean(account.authStatePath),
  }));

  const tasks = Object.values(state.tasks)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || b.priority - a.priority)
    .slice(0, 100);

  return {
    metrics: state.metrics,
    counts: {
      accounts: Object.keys(state.accounts).length,
      mainSubreddits: Object.keys(state.mainSubreddits).length,
      subreddits: Object.keys(state.subreddits).length,
      candidates: Object.values(state.subredditCandidates).filter((candidate) => !candidate.rejectedAt).length,
      users: Object.keys(state.users).length,
      posts: Object.keys(state.posts).length,
      queuedTasks: Object.values(state.tasks).filter((task) => task.status === "queued").length,
      runningTasks: Object.values(state.tasks).filter((task) => task.status === "running").length,
      runs: state.runs.length,
    },
    accounts,
    mainSubreddits: Object.values(state.mainSubreddits).sort((a, b) => a.name.localeCompare(b.name)),
    tasks,
    runs: state.runs.slice(0, 50),
  };
}

export function startDashboardServer(config: CrawlerConfig, store: StateStore) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/") {
        text(res, 200, dashboardHtml(), "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        json(res, 200, publicState(store));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/accounts") {
        const body = await readJson(req);
        const account = await store.addAccount({
          label: typeof body.label === "string" ? body.label : undefined,
          username: typeof body.username === "string" ? body.username : undefined,
          loginSecret: typeof body.loginSecret === "string" ? body.loginSecret : undefined,
          sessionCookie: typeof body.sessionCookie === "string" ? body.sessionCookie : undefined,
          authStatePath: typeof body.authStatePath === "string" ? body.authStatePath : undefined,
          enabled: true,
        });
        json(res, 201, { accountId: account.id });
        return;
      }

      const accountPatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (req.method === "PATCH" && accountPatch) {
        const body = await readJson(req);
        await store.setAccountEnabled(accountPatch[1], Boolean(body.enabled));
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/main-subreddits") {
        const body = await readJson(req);
        if (typeof body.name !== "string") throw new Error("name is required");
        await store.addMainSubreddit(body.name);
        json(res, 201, { ok: true });
        return;
      }

      const subredditPatch = url.pathname.match(/^\/api\/main-subreddits\/([^/]+)$/);
      if (req.method === "PATCH" && subredditPatch) {
        const body = await readJson(req);
        await store.setMainSubredditEnabled(decodeURIComponent(subredditPatch[1]), Boolean(body.enabled));
        json(res, 200, { ok: true });
        return;
      }

      json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Dashboard request failed", { message });
      json(res, 500, { error: message });
    }
  });

  server.listen(config.dashboardPort, config.dashboardHost, () => {
    logger.info("Dashboard listening", {
      url: `http://${config.dashboardHost}:${config.dashboardPort}`,
    });
  });

  return server;
}
