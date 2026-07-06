import type { CrawlerState, CrawlResult, NormalizedSubreddit } from "../types.js";

function now() {
  return new Date().toISOString();
}

function cleanSubreddit(value: string | undefined) {
  return value?.trim().replace(/^r\//i, "").toLowerCase();
}

function cleanUser(value: string | undefined) {
  return value?.trim().replace(/^u\//i, "").toLowerCase();
}

function upsertNsfwSubreddit(state: CrawlerState, subreddit: NormalizedSubreddit, ts: string) {
  const name = cleanSubreddit(subreddit.name);
  if (!name) return;

  if (subreddit.over18 === false) {
    state.subredditCandidates[name] = {
      name,
      firstSeenAt: state.subredditCandidates[name]?.firstSeenAt ?? ts,
      lastSeenAt: ts,
      source: state.subredditCandidates[name]?.source ?? "details",
      rejectedAt: ts,
      rejectReason: "not_nsfw",
    };
    return;
  }

  if (subreddit.over18 !== true) {
    const existing = state.subredditCandidates[name];
    if (!state.subreddits[name]) {
      state.subredditCandidates[name] = {
        name,
        firstSeenAt: existing?.firstSeenAt ?? ts,
        lastSeenAt: ts,
        source: existing?.source ?? subreddit.rawSource,
        detailsTaskQueuedAt: existing?.detailsTaskQueuedAt,
      };
    }
    return;
  }

  const existing = state.subreddits[name];
  state.subreddits[name] = {
    name,
    enabled: existing?.enabled ?? true,
    over18: true,
    firstSeenAt: existing?.firstSeenAt ?? ts,
    lastSeenAt: ts,
    lastDetailsCrawledAt: ts,
    lastFeedCrawledAt: existing?.lastFeedCrawledAt,
    title: subreddit.title ?? existing?.title,
    description: subreddit.description ?? existing?.description,
    members: subreddit.members ?? existing?.members,
    activeUsers: subreddit.activeUsers ?? existing?.activeUsers,
    postCount: existing?.postCount ?? 0,
  };

  delete state.subredditCandidates[name];
}

export function ingestCrawlResult(state: CrawlerState, result: CrawlResult) {
  const ts = now();

  for (const subreddit of result.subreddits) {
    upsertNsfwSubreddit(state, subreddit, ts);
  }

  for (const post of result.posts) {
    const existingPost = state.posts[post.id];
    state.posts[post.id] = {
      ...existingPost,
      ...post,
      firstSeenAt: existingPost?.firstSeenAt ?? ts,
      lastSeenAt: ts,
    };

    const subredditName = cleanSubreddit(post.subreddit);
    if (subredditName) {
      const known = state.subreddits[subredditName];
      if (known?.over18) {
        known.lastSeenAt = ts;
        known.postCount += existingPost ? 0 : 1;
        if (result.task.type === "subreddit" && cleanSubreddit(result.task.target) === subredditName) {
          known.lastFeedCrawledAt = ts;
        }
      } else if (!state.subredditCandidates[subredditName]) {
        state.subredditCandidates[subredditName] = {
          name: subredditName,
          firstSeenAt: ts,
          lastSeenAt: ts,
          source: `post:${post.id}`,
        };
      } else {
        state.subredditCandidates[subredditName].lastSeenAt = ts;
      }
    }

    const username = cleanUser(post.author);
    if (username && username !== "[deleted]") {
      const existing = state.users[username];
      const sourceSubreddits = new Set(existing?.sourceSubreddits ?? []);
      if (subredditName) sourceSubreddits.add(subredditName);

      state.users[username] = {
        username,
        firstSeenAt: existing?.firstSeenAt ?? ts,
        lastSeenAt: ts,
        lastCrawledAt: result.task.type === "user" && cleanUser(result.task.target) === username ? ts : existing?.lastCrawledAt,
        sourceSubreddits: [...sourceSubreddits],
        postCount: (existing?.postCount ?? 0) + (existingPost ? 0 : 1),
      };
    }
  }

  for (const user of result.users) {
    const username = cleanUser(user.username);
    if (!username || username === "[deleted]") continue;

    const existing = state.users[username];
    const sourceSubreddits = new Set(existing?.sourceSubreddits ?? []);
    const sourceSubreddit = cleanSubreddit(user.sourceSubreddit);
    if (sourceSubreddit) sourceSubreddits.add(sourceSubreddit);

    state.users[username] = {
      username,
      firstSeenAt: existing?.firstSeenAt ?? ts,
      lastSeenAt: ts,
      lastCrawledAt: result.task.type === "user" && cleanUser(result.task.target) === username ? ts : existing?.lastCrawledAt,
      sourceSubreddits: [...sourceSubreddits],
      postCount: existing?.postCount ?? 0,
    };
  }

  if (result.task.type === "subreddit") {
    const name = cleanSubreddit(result.task.target);
    if (name && state.subreddits[name]) state.subreddits[name].lastFeedCrawledAt = ts;
  }

  if (result.task.type === "subredditDetails") {
    const name = cleanSubreddit(result.task.target);
    const known = name ? state.subreddits[name] : undefined;
    if (known) known.lastDetailsCrawledAt = ts;
  }
}
