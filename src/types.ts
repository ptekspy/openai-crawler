export type SortMode = "best" | "new" | "hot" | "top";

export type CrawlTask =
  | {
      type: "subreddit";
      target: string;
      sort: SortMode;
      source: "main" | "api" | "discovery" | "config";
    }
  | {
      type: "subredditDetails";
      target: string;
      source: "main" | "api" | "discovery" | "config";
    }
  | {
      type: "home";
      sort: SortMode;
      source: "main" | "api" | "discovery" | "config";
    }
  | {
      type: "user";
      target: string;
      sort: SortMode;
      source: "api" | "discovery" | "config";
    };

export interface CrawlerConfig {
  authStatePath: string;
  statePath: string;
  dashboardHost: string;
  dashboardPort: number;
  headless: boolean;
  scrollDelayMs: number;
  scrollSteps: number;
  taskDelayMs: number;
  cycleDelayMs: number;
  apiUrl?: string;
  apiToken?: string;
  apiImportPath: string;
  apiTargetsPath: string;
  userAgent?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  prioritySubreddits: string[];
  subredditSorts: SortMode[];
  homeSorts: SortMode[];
  extraSubreddits: string[];
  extraUsers: string[];
}

export interface ApiTargetsResponse {
  subreddits?: string[];
  users?: string[];
}

export interface CapturedPayload {
  url: string;
  status: number;
  json: unknown;
}

export interface NormalizedPost {
  id: string;
  thingId?: string;
  title?: string;
  author?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  createdUtc?: number;
  score?: number;
  upvoteRatio?: number;
  commentCount?: number;
  flair?: string;
  isNsfw?: boolean;
  isSpoiler?: boolean;
  rawSource: "reddit-network" | "reddit-dom";
  raw?: unknown;
}

export interface NormalizedUser {
  username: string;
  sourcePostId?: string;
  sourceSubreddit?: string;
}

export interface NormalizedSubreddit {
  name: string;
  title?: string;
  description?: string;
  members?: number;
  activeUsers?: number;
  createdUtc?: number;
  over18?: boolean;
  url?: string;
  rawSource: "reddit-network" | "reddit-dom" | "post-discovery";
  raw?: unknown;
}

export interface CrawlResult {
  task: CrawlTask;
  accountId?: string;
  startedAt: string;
  finishedAt: string;
  payloadCount: number;
  posts: NormalizedPost[];
  users: NormalizedUser[];
  subreddits: NormalizedSubreddit[];
  errors: string[];
}

export type AccountStatus = "idle" | "running" | "disabled" | "needs_session" | "error";

export interface CrawlerAccount {
  id: string;
  label: string;
  username?: string;
  password?: string;
  sessionCookie?: string;
  authStatePath?: string;
  enabled: boolean;
  status: AccountStatus;
  currentTaskId?: string;
  lastRunAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MainSubredditConfig {
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QueueTaskStatus = "queued" | "running" | "done" | "failed";

export interface QueueTask {
  id: string;
  task: CrawlTask;
  status: QueueTaskStatus;
  priority: number;
  dueAt: string;
  lockedByAccountId?: string;
  lockedUntil?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPost extends NormalizedPost {
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface StoredUser {
  username: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastCrawledAt?: string;
  sourceSubreddits: string[];
  postCount: number;
}

export interface StoredSubreddit {
  name: string;
  enabled: boolean;
  over18: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  lastDetailsCrawledAt?: string;
  lastFeedCrawledAt?: string;
  title?: string;
  description?: string;
  members?: number;
  activeUsers?: number;
  postCount: number;
}

export interface SubredditCandidate {
  name: string;
  firstSeenAt: string;
  lastSeenAt: string;
  source: string;
  detailsTaskQueuedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export interface CrawlRunRecord {
  id: string;
  accountId?: string;
  taskId?: string;
  task: CrawlTask;
  startedAt: string;
  finishedAt: string;
  postCount: number;
  userCount: number;
  subredditCount: number;
  errorCount: number;
  status: "ok" | "failed";
}

export interface CrawlerState {
  version: 1;
  accounts: Record<string, CrawlerAccount>;
  mainSubreddits: Record<string, MainSubredditConfig>;
  tasks: Record<string, QueueTask>;
  posts: Record<string, StoredPost>;
  users: Record<string, StoredUser>;
  subreddits: Record<string, StoredSubreddit>;
  subredditCandidates: Record<string, SubredditCandidate>;
  runs: CrawlRunRecord[];
  metrics: {
    totalCycles: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    startedAt: string;
    updatedAt: string;
  };
}
