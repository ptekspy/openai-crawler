import { createBrowserSession } from "../browser.js";
import { logger } from "../logger.js";
import type { CrawlResult, CrawlTask, CrawlerConfig, NormalizedPost } from "../types.js";
import { sleep } from "../utils.js";
import { extractDomPosts } from "./domExtract.js";
import { attachNetworkCapture } from "./networkCapture.js";
import { normaliseCapturedPosts } from "./normalise.js";
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

export async function crawlRedditTask(config: CrawlerConfig, task: CrawlTask): Promise<CrawlResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const url = redditUrlForTask(task);
  const session = await createBrowserSession(config);
  const capture = attachNetworkCapture(session.page);

  try {
    logger.info("Crawling Reddit task", { task, url });

    await session.page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    await session.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    for (let i = 0; i < config.scrollSteps; i += 1) {
      await session.page.mouse.wheel(0, 1800);
      await sleep(config.scrollDelayMs);
    }

    await session.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const networkPosts = normaliseCapturedPosts(capture.payloads);
    const domPosts = await extractDomPosts(session.page).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.warn("DOM fallback extraction failed", { message, task });
      return [];
    });

    const posts = mergePosts(networkPosts, domPosts);

    logger.info("Finished Reddit task", {
      task,
      payloads: capture.payloads.length,
      networkPosts: networkPosts.length,
      domPosts: domPosts.length,
      posts: posts.length,
    });

    return {
      task,
      startedAt,
      finishedAt: new Date().toISOString(),
      payloadCount: capture.payloads.length,
      posts,
      errors: [...errors, ...capture.errors],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Reddit task failed", { task, message });

    return {
      task,
      startedAt,
      finishedAt: new Date().toISOString(),
      payloadCount: capture.payloads.length,
      posts: normaliseCapturedPosts(capture.payloads),
      errors: [...errors, ...capture.errors, message],
    };
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}
