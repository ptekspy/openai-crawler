import type { ApiTargetsResponse, CrawlTask, CrawlerConfig, SortMode } from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function taskKey(task: CrawlTask): string {
  if (task.type === "home") return `home:${task.sort}`;
  return `${task.type}:${task.target.toLowerCase()}:${task.sort}`;
}

function pushUnique(tasks: CrawlTask[], seen: Set<string>, task: CrawlTask) {
  const key = taskKey(task);
  if (seen.has(key)) return;
  seen.add(key);
  tasks.push(task);
}

function sortModes(sorts: SortMode[]): SortMode[] {
  return sorts.length ? sorts : ["best", "new"];
}

export function buildTasks(config: CrawlerConfig, apiTargets: ApiTargetsResponse): CrawlTask[] {
  const tasks: CrawlTask[] = [];
  const seen = new Set<string>();

  for (const subreddit of unique(config.prioritySubreddits)) {
    for (const sort of sortModes(config.subredditSorts)) {
      pushUnique(tasks, seen, {
        type: "subreddit",
        target: subreddit,
        sort,
        source: "priority",
      });
    }
  }

  for (const sort of sortModes(config.homeSorts)) {
    pushUnique(tasks, seen, {
      type: "home",
      sort,
      source: "priority",
    });
  }

  for (const subreddit of unique([...(apiTargets.subreddits ?? []), ...config.extraSubreddits])) {
    for (const sort of sortModes(config.subredditSorts)) {
      pushUnique(tasks, seen, {
        type: "subreddit",
        target: subreddit,
        sort,
        source: apiTargets.subreddits?.includes(subreddit) ? "api" : "config",
      });
    }
  }

  for (const user of unique([...(apiTargets.users ?? []), ...config.extraUsers])) {
    pushUnique(tasks, seen, {
      type: "user",
      target: user,
      sort: "new",
      source: apiTargets.users?.includes(user) ? "api" : "config",
    });
  }

  return tasks;
}
