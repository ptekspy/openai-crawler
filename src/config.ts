import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { CrawlerConfig, SortMode } from "./types.js";

const defaultTasksSchema = z.object({
  prioritySubreddits: z.array(z.string()).default([]),
  subredditSorts: z.array(z.enum(["best", "new", "hot", "top"])).default(["best", "new"]),
  homeSorts: z.array(z.enum(["best", "new", "hot", "top"])).default(["best", "new"]),
  extraSubreddits: z.array(z.string()).default([]),
  extraUsers: z.array(z.string()).default([]),
});

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStringArrayEnv(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readDefaultTasks() {
  const filePath = path.join(process.cwd(), "config", "default-tasks.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return defaultTasksSchema.parse(JSON.parse(raw));
}

export function loadConfig(): CrawlerConfig {
  const defaults = readDefaultTasks();

  const proxyServer = optional(process.env.CRAWLER_PROXY_SERVER);
  const proxy = proxyServer
    ? {
        server: proxyServer,
        username: optional(process.env.CRAWLER_PROXY_USERNAME),
        password: optional(process.env.CRAWLER_PROXY_PASSWORD),
      }
    : undefined;

  const envPrioritySubreddits = parseStringArrayEnv(process.env.CRAWLER_PRIORITY_SUBREDDITS);
  const prioritySubreddits = unique(envPrioritySubreddits.length ? envPrioritySubreddits : defaults.prioritySubreddits);

  return {
    authStatePath: process.env.REDDIT_AUTH_STATE || ".auth/reddit.json",
    headless: boolFromEnv(process.env.CRAWLER_HEADLESS, true),
    scrollDelayMs: intFromEnv(process.env.CRAWLER_SCROLL_DELAY_MS, 1200),
    scrollSteps: intFromEnv(process.env.CRAWLER_SCROLL_STEPS, 8),
    taskDelayMs: intFromEnv(process.env.CRAWLER_TASK_DELAY_MS, 5000),
    cycleDelayMs: intFromEnv(process.env.CRAWLER_CYCLE_DELAY_MS, 300_000),
    apiUrl: optional(process.env.CRAWLER_API_URL),
    apiToken: optional(process.env.CRAWLER_API_TOKEN),
    apiImportPath: process.env.CRAWLER_API_IMPORT_PATH || "/api/crawler/import",
    apiTargetsPath: process.env.CRAWLER_API_TARGETS_PATH || "/api/crawler/targets",
    userAgent: optional(process.env.CRAWLER_USER_AGENT),
    proxy,
    prioritySubreddits,
    subredditSorts: defaults.subredditSorts as SortMode[],
    homeSorts: defaults.homeSorts as SortMode[],
    extraSubreddits: unique([...defaults.extraSubreddits, ...parseStringArrayEnv(process.env.CRAWLER_EXTRA_SUBREDDITS)]),
    extraUsers: unique([...defaults.extraUsers, ...parseStringArrayEnv(process.env.CRAWLER_EXTRA_USERS)]),
  };
}
