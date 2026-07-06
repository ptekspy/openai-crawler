import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  CrawlerAccount,
  CrawlerState,
  CrawlRunRecord,
  MainSubredditConfig,
  QueueTask,
  QueueTaskStatus,
} from "../types.js";

function now() {
  return new Date().toISOString();
}

function cleanKey(value: string) {
  return value.trim().replace(/^r\//i, "").replace(/^u\//i, "").toLowerCase();
}

export function createEmptyState(mainSubreddits: string[]): CrawlerState {
  const ts = now();
  const mains: Record<string, MainSubredditConfig> = {};

  for (const name of mainSubreddits) {
    const key = cleanKey(name);
    if (!key) continue;
    mains[key] = {
      name: key,
      enabled: true,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  return {
    version: 1,
    accounts: {},
    mainSubreddits: mains,
    tasks: {},
    posts: {},
    users: {},
    subreddits: {},
    subredditCandidates: {},
    runs: [],
    metrics: {
      totalCycles: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      startedAt: ts,
      updatedAt: ts,
    },
  };
}

export class StateStore {
  private state?: CrawlerState;
  private writeChain = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultMainSubreddits: string[],
  ) {}

  async load(): Promise<CrawlerState> {
    if (this.state) return this.state;

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw) as CrawlerState;
    } catch {
      this.state = createEmptyState(this.defaultMainSubreddits);
      await this.save();
    }

    this.ensureDefaultMainSubreddits();
    await this.save();
    return this.state;
  }

  get snapshot(): CrawlerState {
    if (!this.state) throw new Error("State has not been loaded yet");
    return structuredClone(this.state);
  }

  mutate(mutator: (state: CrawlerState) => void): CrawlerState {
    if (!this.state) throw new Error("State has not been loaded yet");
    mutator(this.state);
    this.state.metrics.updatedAt = now();
    return this.state;
  }

  async save(): Promise<void> {
    if (!this.state) return;

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
      await fs.rename(tempPath, this.filePath);
    });

    await this.writeChain;
  }

  async transaction(mutator: (state: CrawlerState) => void): Promise<CrawlerState> {
    const state = this.mutate(mutator);
    await this.save();
    return state;
  }

  ensureDefaultMainSubreddits() {
    if (!this.state) throw new Error("State has not been loaded yet");
    const ts = now();

    for (const name of this.defaultMainSubreddits) {
      const key = cleanKey(name);
      if (!key || this.state.mainSubreddits[key]) continue;
      this.state.mainSubreddits[key] = {
        name: key,
        enabled: true,
        createdAt: ts,
        updatedAt: ts,
      };
    }
  }

  async addMainSubreddit(name: string) {
    const key = cleanKey(name);
    if (!key) return;

    await this.transaction((state) => {
      const existing = state.mainSubreddits[key];
      state.mainSubreddits[key] = {
        name: key,
        enabled: existing?.enabled ?? true,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      };
    });
  }

  async setMainSubredditEnabled(name: string, enabled: boolean) {
    const key = cleanKey(name);
    await this.transaction((state) => {
      const existing = state.mainSubreddits[key];
      if (!existing) return;
      existing.enabled = enabled;
      existing.updatedAt = now();
    });
  }

  async addAccount(input: {
    label?: string;
    username?: string;
    loginSecret?: string;
    sessionCookie?: string;
    authStatePath?: string;
    enabled?: boolean;
  }): Promise<CrawlerAccount> {
    const ts = now();
    const account: CrawlerAccount = {
      id: randomUUID(),
      label: input.label?.trim() || input.username?.trim() || "Reddit account",
      username: input.username?.trim() || undefined,
      loginSecret: input.loginSecret || undefined,
      sessionCookie: input.sessionCookie?.trim() || undefined,
      authStatePath: input.authStatePath?.trim() || undefined,
      enabled: input.enabled ?? true,
      status: input.enabled === false ? "disabled" : "idle",
      createdAt: ts,
      updatedAt: ts,
    };

    await this.transaction((state) => {
      state.accounts[account.id] = account;
    });

    return account;
  }

  async setAccountEnabled(accountId: string, enabled: boolean) {
    await this.transaction((state) => {
      const account = state.accounts[accountId];
      if (!account) return;
      account.enabled = enabled;
      account.status = enabled ? "idle" : "disabled";
      account.currentTaskId = undefined;
      account.updatedAt = now();
    });
  }

  async recordRun(run: CrawlRunRecord) {
    await this.transaction((state) => {
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 250);
      if (run.status === "ok") state.metrics.totalTasksCompleted += 1;
      else state.metrics.totalTasksFailed += 1;
    });
  }

  async setTaskStatus(taskId: string, status: QueueTaskStatus, lastError?: string) {
    await this.transaction((state) => {
      const task = state.tasks[taskId];
      if (!task) return;
      task.status = status;
      task.updatedAt = now();
      task.lastError = lastError;
      if (status !== "running") {
        task.lockedByAccountId = undefined;
        task.lockedUntil = undefined;
      }
    });
  }

  async upsertTask(task: QueueTask) {
    await this.transaction((state) => {
      const existing = state.tasks[task.id];
      state.tasks[task.id] = existing
        ? {
            ...existing,
            ...task,
            attempts: existing.attempts,
            status: existing.status === "running" ? existing.status : task.status,
            createdAt: existing.createdAt,
            updatedAt: now(),
          }
        : task;
    });
  }
}
