import { createBrowserSession } from "../browser.js";
import { logger } from "../logger.js";
import type { CrawlerAccount, CrawlResult, CrawlTask, CrawlerConfig, NormalizedPost, NormalizedUser } from "../types.js";
import { sleep } from "../utils.js";
import { extractDomPosts } from "./domExtract.js";
import { attachNetworkCapture } from "./networkCapture.js";
import { normaliseCaptured } from "./normalise.js";
import { redditUrlForTask } from "./urls.js";

function mergePosts(networkPosts: NormalizedPost[], domPosts: NormalizedPost[]): NormalizedPost[] {
  const byId = new Map<string, NormalizedPost>();

  for (const post of [...networkPosts, ...domPosts]) {
    const existing = byId.get(post.id);
    if (!existing) {
      byId.set(post.id, post);
      continue;
    }

    byId.set(post.id, {
      ...post,
      ...existing,
      rawSource: existing.rawSource === "reddit-network" ? existing.rawSource : post.rawSource,
    });
  }

  return [...byId.values()];
}

function usersFromPosts(posts: NormalizedPost[]): NormalizedUser[] {
  const seen = new Set<string>();
  const users: NormalizedUser[] = [];

  for (const post of posts) {
    if (!post.author) continue;
    const key = post.author.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    users.push({
      username: post.author,
      sourcePostId: post.id,
      sourceSubreddit: post.subreddit,
    });
  }

  return users;
}

export async function crawlRedditTask(config: CrawlerConfig, task: CrawlTask, account?: CrawlerAccount): Promise<CrawlResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const url = redditUrlForTask(task);
  const session = await createBrowserSession(config, account);
  const capture = attachNetworkCapture(session.page);

  try {
    logger.info("Crawling Reddit task", { task, url, accountId: account?.id });

    await session.page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    await session.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    for (let i = 0; i < config.scrollSteps; i += 1) {
      await session.page.mouse.wheel(0, 1800);
      await sleep(config.scrollDelayMs);
    }

    await session.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const network = normaliseCaptured(capture.payloads);
    const domPosts = await extractDomPosts(session.page).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.warn("DOM fallback extraction failed", { message, task });
      return [];
    });

    const posts = mergePosts(network.posts, domPosts);
    const users = [...network.users, ...usersFromPosts(posts)];

    logger.info("Finished Reddit task", {
      task,
      accountId: account?.id,
      payloads: capture.payloads.length,
      networkPosts: network.posts.length,
      domPosts: domPosts.length,
      posts: posts.length,
      users: users.length,
      subreddits: network.subreddits.length,
    });

    return {
      task,
      accountId: account?.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      payloadCount: capture.payloads.length,
      posts,
      users,
      subreddits: network.subreddits,
      errors: [...errors, ...capture.errors],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Reddit task failed", { task, accountId: account?.id, message });

    const network = normaliseCaptured(capture.payloads);

    return {
      task,
      accountId: account?.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      payloadCount: capture.payloads.length,
      posts: network.posts,
      users: network.users,
      subreddits: network.subreddits,
      errors: [...errors, ...capture.errors, message],
    };
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}
