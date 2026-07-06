import type { CapturedPayload, NormalizedPost, NormalizedSubreddit, NormalizedUser } from "../types.js";
import { asBoolean, asNumber, asString } from "../utils.js";

const MAX_OBJECTS_TO_SCAN = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPath(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record;

  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }

  return current;
}

function firstString(record: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = asString(getPath(record, path));
    if (value) return value;
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = asNumber(getPath(record, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstBoolean(record: Record<string, unknown>, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const value = asBoolean(getPath(record, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

function unwrapCandidate(record: Record<string, unknown>): Record<string, unknown> {
  const data = record.data;
  if (isRecord(data)) return data;
  return record;
}

function cleanSubreddit(value: string | undefined) {
  return value?.replace(/^r\//i, "").trim();
}

function cleanUser(value: string | undefined) {
  return value?.replace(/^u\//i, "").trim();
}

function looksLikePost(record: Record<string, unknown>): boolean {
  const candidate = unwrapCandidate(record);
  const title = firstString(candidate, [["title"], ["postTitle"]]);
  const id = firstString(candidate, [["id"], ["postId"], ["thingId"], ["name"]]);
  const subreddit = firstString(candidate, [
    ["subreddit"],
    ["subredditName"],
    ["communityName"],
    ["subreddit", "displayText"],
  ]);

  return Boolean(title && id && (subreddit || firstString(candidate, [["permalink"], ["url"]])));
}

function looksLikeSubreddit(record: Record<string, unknown>): boolean {
  const candidate = unwrapCandidate(record);
  const rawName = firstString(candidate, [["display_name"], ["displayName"], ["subredditName"], ["communityName"]]);
  const name = cleanSubreddit(rawName);
  if (!name || /^t[1-6]_/.test(name)) return false;

  const hasSubredditFields =
    firstNumber(candidate, [["subscribers"], ["subscriberCount"], ["members"], ["memberCount"]]) !== undefined ||
    firstString(candidate, [["public_description"], ["publicDescription"], ["communityDescription"]]) !== undefined ||
    firstBoolean(candidate, [["over18"], ["over_18"], ["isNsfw"], ["nsfw"]]) !== undefined;

  return hasSubredditFields;
}

function normaliseId(id: string | undefined, title: string | undefined, permalink: string | undefined): string | undefined {
  if (id) return id.replace(/^t3_/, "");
  if (permalink) return permalink;
  if (title) return title;
  return undefined;
}

function normalisePost(record: Record<string, unknown>): NormalizedPost | undefined {
  const candidate = unwrapCandidate(record);

  const title = firstString(candidate, [["title"], ["postTitle"]]);
  const rawId = firstString(candidate, [["id"], ["postId"], ["thingId"], ["name"]]);
  const permalink = firstString(candidate, [["permalink"], ["postPermalink"], ["commentsLink"]]);
  const id = normaliseId(rawId, title, permalink);

  if (!id || !title) return undefined;

  const subreddit = firstString(candidate, [
    ["subreddit"],
    ["subredditName"],
    ["communityName"],
    ["subreddit", "displayText"],
    ["community", "name"],
  ]);

  const author = firstString(candidate, [
    ["author"],
    ["authorName"],
    ["authorInfo", "name"],
    ["authorInfo", "username"],
    ["profile", "name"],
  ]);

  const url = firstString(candidate, [
    ["url"],
    ["postUrl"],
    ["outboundLink", "url"],
    ["source", "url"],
    ["media", "content"],
  ]);

  const flair = firstString(candidate, [
    ["link_flair_text"],
    ["flairText"],
    ["flair", "text"],
    ["postFlair", "text"],
  ]);

  return {
    id,
    thingId: rawId?.startsWith("t3_") ? rawId : rawId ? `t3_${rawId}` : undefined,
    title,
    author: cleanUser(author),
    subreddit: cleanSubreddit(subreddit),
    permalink: permalink?.startsWith("http") ? permalink : permalink ? `https://www.reddit.com${permalink}` : undefined,
    url,
    createdUtc: firstNumber(candidate, [["created_utc"], ["createdUtc"], ["createdAt"], ["created"]]),
    score: firstNumber(candidate, [["score"], ["upvotes"], ["upvoteCount"], ["voteCount"]]),
    upvoteRatio: firstNumber(candidate, [["upvote_ratio"], ["upvoteRatio"]]),
    commentCount: firstNumber(candidate, [["num_comments"], ["numComments"], ["commentCount"], ["commentsCount"]]),
    flair,
    isNsfw: firstBoolean(candidate, [["over_18"], ["over18"], ["isNsfw"], ["nsfw"]]),
    isSpoiler: firstBoolean(candidate, [["spoiler"], ["isSpoiler"]]),
    rawSource: "reddit-network",
    raw: candidate,
  };
}

function normaliseSubreddit(record: Record<string, unknown>): NormalizedSubreddit | undefined {
  const candidate = unwrapCandidate(record);
  const rawName = firstString(candidate, [["display_name"], ["displayName"], ["subredditName"], ["communityName"]]);
  const name = cleanSubreddit(rawName);
  if (!name) return undefined;

  return {
    name,
    title: firstString(candidate, [["title"], ["communityTitle"]]),
    description: firstString(candidate, [["public_description"], ["publicDescription"], ["description"], ["communityDescription"]]),
    members: firstNumber(candidate, [["subscribers"], ["subscriberCount"], ["members"], ["memberCount"]]),
    activeUsers: firstNumber(candidate, [["active_user_count"], ["activeUserCount"], ["activeUsers"]]),
    createdUtc: firstNumber(candidate, [["created_utc"], ["createdUtc"], ["created"]]),
    over18: firstBoolean(candidate, [["over18"], ["over_18"], ["isNsfw"], ["nsfw"]]),
    url: firstString(candidate, [["url"], ["communityUrl"]]),
    rawSource: "reddit-network",
    raw: candidate,
  };
}

function scan(
  value: unknown,
  results: {
    posts: NormalizedPost[];
    subreddits: NormalizedSubreddit[];
    users: NormalizedUser[];
  },
  seenObjects: WeakSet<object>,
  seenIds: Set<string>,
  seenSubreddits: Set<string>,
  seenUsers: Set<string>,
  counter: { count: number },
) {
  if (counter.count > MAX_OBJECTS_TO_SCAN) return;

  if (Array.isArray(value)) {
    for (const item of value) scan(item, results, seenObjects, seenIds, seenSubreddits, seenUsers, counter);
    return;
  }

  if (!isRecord(value)) return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);
  counter.count += 1;

  if (looksLikePost(value)) {
    const post = normalisePost(value);
    if (post && !seenIds.has(post.id)) {
      seenIds.add(post.id);
      results.posts.push(post);

      if (post.author && !seenUsers.has(post.author.toLowerCase())) {
        seenUsers.add(post.author.toLowerCase());
        results.users.push({ username: post.author, sourcePostId: post.id, sourceSubreddit: post.subreddit });
      }

      if (post.subreddit && !seenSubreddits.has(post.subreddit.toLowerCase())) {
        seenSubreddits.add(post.subreddit.toLowerCase());
        results.subreddits.push({ name: post.subreddit, over18: post.isNsfw, rawSource: "post-discovery" });
      }
    }
  }

  if (looksLikeSubreddit(value)) {
    const subreddit = normaliseSubreddit(value);
    if (subreddit && !seenSubreddits.has(subreddit.name.toLowerCase())) {
      seenSubreddits.add(subreddit.name.toLowerCase());
      results.subreddits.push(subreddit);
    }
  }

  for (const inner of Object.values(value)) {
    scan(inner, results, seenObjects, seenIds, seenSubreddits, seenUsers, counter);
  }
}

export function normaliseCaptured(payloads: CapturedPayload[]) {
  const results = {
    posts: [] as NormalizedPost[],
    subreddits: [] as NormalizedSubreddit[],
    users: [] as NormalizedUser[],
  };
  const seenObjects = new WeakSet<object>();
  const seenIds = new Set<string>();
  const seenSubreddits = new Set<string>();
  const seenUsers = new Set<string>();
  const counter = { count: 0 };

  for (const payload of payloads) {
    scan(payload.json, results, seenObjects, seenIds, seenSubreddits, seenUsers, counter);
  }

  return results;
}

export function normaliseCapturedPosts(payloads: CapturedPayload[]): NormalizedPost[] {
  return normaliseCaptured(payloads).posts;
}
