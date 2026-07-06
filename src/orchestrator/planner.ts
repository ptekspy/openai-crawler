import type { CrawlerState, QueueTask } from "../types.js";
import { dueAtForMainTask, makeQueueTask, makeOneOffQueueTask, nowIso } from "./schedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function enabledMainSubreddits(state: CrawlerState) {
  return Object.values(state.mainSubreddits)
    .filter((subreddit) => subreddit.enabled)
    .map((subreddit) => subreddit.name);
}

function hasQueuedTask(state: CrawlerState, prefix: string) {
  return Object.values(state.tasks).some((task) => task.id.startsWith(prefix) && ["queued", "running"].includes(task.status));
}

export function planRecurringMainTasks(state: CrawlerState): QueueTask[] {
  const planned: QueueTask[] = [];
  const now = new Date();

  for (const sort of ["best", "new"] as const) {
    planned.push(
      makeQueueTask(
        {
          type: "home",
          sort,
          source: "main",
        },
        dueAtForMainTask({ type: "home", sort, source: "main" }, now),
        sort === "new" ? 100 : 90,
      ),
    );
  }

  for (const target of enabledMainSubreddits(state)) {
    for (const sort of ["best", "new"] as const) {
      planned.push(
        makeQueueTask(
          {
            type: "subreddit",
            target,
            sort,
            source: "main",
          },
          dueAtForMainTask({ type: "subreddit", target, sort, source: "main" }, now),
          sort === "new" ? 110 : 95,
        ),
      );
    }

    planned.push(
      makeQueueTask(
        {
          type: "subredditDetails",
          target,
          source: "main",
        },
        dueAtForMainTask({ type: "subredditDetails", target, source: "main" }, now),
        80,
      ),
    );
  }

  return planned;
}

export function planDiscoveryTasks(state: CrawlerState): QueueTask[] {
  const planned: QueueTask[] = [];
  const now = Date.now();

  for (const candidate of Object.values(state.subredditCandidates)) {
    if (candidate.rejectedAt) continue;
    if (state.subreddits[candidate.name]) continue;
    if (hasQueuedTask(state, `subreddit-details:${candidate.name}`)) continue;

    planned.push(
      makeOneOffQueueTask(
        {
          type: "subredditDetails",
          target: candidate.name,
          source: "discovery",
        },
        70,
      ),
    );
  }

  for (const subreddit of Object.values(state.subreddits)) {
    if (!subreddit.enabled || !subreddit.over18) continue;

    const detailsAge = subreddit.lastDetailsCrawledAt ? now - Date.parse(subreddit.lastDetailsCrawledAt) : Number.POSITIVE_INFINITY;
    if (detailsAge > DAY_MS && !hasQueuedTask(state, `subreddit-details:${subreddit.name}`)) {
      planned.push(
        makeOneOffQueueTask(
          {
            type: "subredditDetails",
            target: subreddit.name,
            source: "discovery",
          },
          55,
        ),
      );
    }

    const feedAge = subreddit.lastFeedCrawledAt ? now - Date.parse(subreddit.lastFeedCrawledAt) : Number.POSITIVE_INFINITY;
    if (feedAge > 6 * 60 * 60 * 1000 && !hasQueuedTask(state, `subreddit:${subreddit.name}:new`)) {
      planned.push(
        makeOneOffQueueTask(
          {
            type: "subreddit",
            target: subreddit.name,
            sort: "new",
            source: "discovery",
          },
          45,
        ),
      );
    }
  }

  for (const user of Object.values(state.users)) {
    const age = user.lastCrawledAt ? now - Date.parse(user.lastCrawledAt) : Number.POSITIVE_INFINITY;
    if (age < 12 * 60 * 60 * 1000) continue;
    if (hasQueuedTask(state, `user:${user.username.toLowerCase()}:new`)) continue;

    planned.push(
      makeOneOffQueueTask(
        {
          type: "user",
          target: user.username,
          sort: "new",
          source: "discovery",
        },
        35,
      ),
    );
  }

  return planned;
}

export function pruneOldTasks(state: CrawlerState) {
  const cutoff = Date.now() - 7 * DAY_MS;

  for (const [id, task] of Object.entries(state.tasks)) {
    if (task.status === "running" || task.status === "queued") continue;
    if (Date.parse(task.updatedAt) < cutoff) delete state.tasks[id];
  }
}

export function markPlannerCycle(state: CrawlerState) {
  state.metrics.totalCycles += 1;
  state.metrics.updatedAt = nowIso();
}
