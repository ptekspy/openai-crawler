import type { Page } from "playwright";

import type { NormalizedPost } from "../types.js";

interface DomPost {
  id?: string;
  title?: string;
  author?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  score?: number;
  commentCount?: number;
  flair?: string;
  isNsfw?: boolean;
}

function parseNumber(value?: string | null): number | undefined {
  if (!value) return undefined;

  const clean = value.trim().toLowerCase().replace(/,/g, "");
  const match = clean.match(/([\d.]+)\s*([km])?/);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;

  if (match[2] === "k") return Math.round(amount * 1_000);
  if (match[2] === "m") return Math.round(amount * 1_000_000);
  return amount;
}

export async function extractDomPosts(page: Page): Promise<NormalizedPost[]> {
  const domPosts = await page.evaluate(() => {
    const getText = (root: Element, selector: string) => root.querySelector(selector)?.textContent?.trim() || undefined;
    const getAttr = (root: Element, selector: string, attr: string) => root.querySelector(selector)?.getAttribute(attr) || undefined;

    const postElements = [
      ...document.querySelectorAll("shreddit-post"),
      ...document.querySelectorAll("article[data-testid='post-container']"),
    ];

    return postElements.map((post) => {
      const title =
        post.getAttribute("post-title") ||
        post.getAttribute("aria-label") ||
        getText(post, "[slot='title']") ||
        getText(post, "h3") ||
        getText(post, "a[slot='title']");

      const permalink =
        post.getAttribute("permalink") ||
        post.getAttribute("content-href") ||
        getAttr(post, "a[href*='/comments/']", "href");

      const author =
        post.getAttribute("author") ||
        getText(post, "a[href^='/user/']") ||
        getText(post, "a[href*='/user/']");

      const subreddit =
        post.getAttribute("subreddit-name") ||
        getText(post, "a[href^='/r/']") ||
        getText(post, "a[href*='/r/']");

      const id =
        post.getAttribute("id") ||
        post.getAttribute("thingid") ||
        post.getAttribute("post-id") ||
        permalink;

      const scoreText =
        post.getAttribute("score") ||
        getText(post, "[aria-label*='upvote']") ||
        getText(post, "[data-testid='post-vote-count']");

      const commentText =
        post.getAttribute("comment-count") ||
        getText(post, "a[href*='/comments/'][aria-label*='comment']") ||
        getText(post, "[data-testid='comments-page-link-num-comments']");

      return {
        id,
        title,
        author,
        subreddit,
        permalink,
        url: post.getAttribute("content-href") || getAttr(post, "a[slot='title']", "href"),
        scoreText,
        commentText,
        flair: getText(post, "[slot='post-flair']") || post.getAttribute("post-flair"),
        isNsfw: post.textContent?.toLowerCase().includes("nsfw") || undefined,
      };
    });
  });

  const seen = new Set<string>();

  return (domPosts as Array<DomPost & { scoreText?: string; commentText?: string }>)
    .map((post) => {
      const id = post.id?.replace(/^t3_/, "") || post.permalink || post.title;
      if (!id || !post.title) return undefined;

      const permalink = post.permalink?.startsWith("http")
        ? post.permalink
        : post.permalink
          ? `https://www.reddit.com${post.permalink}`
          : undefined;

      const normalized: NormalizedPost = {
        id,
        thingId: id.startsWith("t3_") ? id : `t3_${id}`,
        title: post.title,
        author: post.author?.replace(/^u\//i, ""),
        subreddit: post.subreddit?.replace(/^r\//i, ""),
        permalink,
        url: post.url,
        score: parseNumber(post.scoreText),
        commentCount: parseNumber(post.commentText),
        flair: post.flair,
        isNsfw: post.isNsfw,
        rawSource: "reddit-dom",
        raw: post,
      };

      return normalized;
    })
    .filter((post): post is NormalizedPost => {
      if (!post) return false;
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
}
