export type SortMode = "best" | "new" | "hot" | "top";

export type CrawlTask =
  | {
      type: "subreddit";
      target: string;
      sort: SortMode;
      source: "priority" | "api" | "config";
    }
  | {
      type: "home";
      sort: SortMode;
      source: "priority" | "api" | "config";
    }
  | {
      type: "user";
      target: string;
      sort: SortMode;
      source: "api" | "config";
    };

export interface CrawlerConfig {
  authStatePath: string;
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

export interface CrawlResult {
  task: CrawlTask;
  startedAt: string;
  finishedAt: string;
  payloadCount: number;
  posts: NormalizedPost[];
  errors: string[];
}
