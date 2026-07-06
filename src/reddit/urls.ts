import type { CrawlTask } from "../types.js";

function cleanTarget(target: string): string {
  return target.replace(/^r\//i, "").replace(/^u\//i, "").replace(/^\/+|\/+$/g, "");
}

export function redditUrlForTask(task: CrawlTask): string {
  switch (task.type) {
    case "home":
      return `https://www.reddit.com/${task.sort}/`;
    case "subreddit":
      return `https://www.reddit.com/r/${cleanTarget(task.target)}/${task.sort}/`;
    case "user":
      return `https://www.reddit.com/user/${cleanTarget(task.target)}/submitted/`;
  }
}
