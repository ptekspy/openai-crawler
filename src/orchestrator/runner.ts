import { randomUUID } from "node:crypto";

import { ApiClient } from "../apiClient.js";
import { logger } from "../logger.js";
import { crawlRedditTask } from "../reddit/crawlPage.js";
import { ingestCrawlResult } from "../state/ingest.js";
import type { StateStore } from "../state/store.js";
import type { CrawlerAccount, CrawlerConfig, QueueTask } from "../types.js";
import { sleep } from "../utils.js";
import { markPlannerCycle, planDiscoveryTasks, planRecurringMainTasks, pruneOldTasks } from "./planner.js";
import { claimNextTask, releaseAccount } from "./queue.js";
import { nextDueAfterTask, nowIso } from "./schedule.js";

const TASK_LOCK_MS = 10 * 60 * 1000;

export class AutonomousCrawlerRunner {
  private stopped = false;
  private activeWorkers = new Set<string>();

  constructor(
    private readonly config: CrawlerConfig,
    private readonly store: StateStore,
    private readonly api = new ApiClient(config),
  ) {}

  stop() {
    this.stopped = true;
  }

  async start() {
    await this.store.load();
    await this.seedPlannerOnce();

    void this.plannerLoop();
    void this.accountSupervisorLoop();
  }

  private async seedPlannerOnce() {
    await this.store.transaction((state) => {
      for (const task of [...planRecurringMainTasks(state), ...planDiscoveryTasks(state)]) {
        if (state.tasks[task.id]?.status === "running") continue;
        state.tasks[task.id] = state.tasks[task.id] ?? task;
      }
      pruneOldTasks(state);
      markPlannerCycle(state);
    });
  }

  private async plannerLoop() {
    while (!this.stopped) {
      try {
        await this.store.transaction((state) => {
          for (const task of [...planRecurringMainTasks(state), ...planDiscoveryTasks(state)]) {
            const existing = state.tasks[task.id];
            if (!existing || ["done", "failed"].includes(existing.status)) state.tasks[task.id] = task;
          }
          pruneOldTasks(state);
          markPlannerCycle(state);
        });
      } catch (error) {
        logger.error("Planner loop failed", { error: error instanceof Error ? error.message : String(error) });
      }

      await sleep(30_000);
    }
  }

  private async accountSupervisorLoop() {
    while (!this.stopped) {
      const state = this.store.snapshot;
      const enabledAccounts = Object.values(state.accounts).filter((account) => account.enabled);

      for (const account of enabledAccounts) {
        if (this.activeWorkers.has(account.id)) continue;
        this.activeWorkers.add(account.id);
        void this.accountWorker(account.id).finally(() => this.activeWorkers.delete(account.id));
      }

      await sleep(10_000);
    }
  }

  private async accountWorker(accountId: string) {
    while (!this.stopped) {
      const account = this.store.snapshot.accounts[accountId];
      if (!account?.enabled) return;

      const task = await this.claimTask(accountId);
      if (!task) {
        await sleep(this.config.taskDelayMs);
        continue;
      }

      await this.runTask(account, task);
      await sleep(this.config.taskDelayMs);
    }
  }

  private async claimTask(accountId: string): Promise<QueueTask | undefined> {
    let claimed: QueueTask | undefined;
    await this.store.transaction((state) => {
      claimed = claimNextTask(state, accountId, TASK_LOCK_MS);
    });
    return claimed;
  }

  private async runTask(account: CrawlerAccount, queueTask: QueueTask) {
    try {
      const result = await crawlRedditTask(this.config, queueTask.task, account);
      await this.api.sendResult(result);

      await this.store.transaction((state) => {
        ingestCrawlResult(state, result);

        const task = state.tasks[queueTask.id];
        if (task) {
          task.status = "done";
          task.lockedByAccountId = undefined;
          task.lockedUntil = undefined;
          task.updatedAt = nowIso();

          if (queueTask.task.source === "main") {
            task.status = "queued";
            task.dueAt = nextDueAfterTask(queueTask.task);
          }
        }

        releaseAccount(state, account.id, result.errors.length ? "error" : "idle", result.errors[0]);
      });

      await this.store.recordRun({
        id: randomUUID(),
        accountId: account.id,
        taskId: queueTask.id,
        task: queueTask.task,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        postCount: result.posts.length,
        userCount: result.users.length,
        subredditCount: result.subreddits.length,
        errorCount: result.errors.length,
        status: result.errors.length ? "failed" : "ok",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Task run failed", { accountId: account.id, taskId: queueTask.id, message });

      await this.store.transaction((state) => {
        const task = state.tasks[queueTask.id];
        if (task) {
          task.status = task.attempts >= 3 ? "failed" : "queued";
          task.lastError = message;
          task.lockedByAccountId = undefined;
          task.lockedUntil = undefined;
          task.updatedAt = nowIso();
        }
        releaseAccount(state, account.id, "error", message);
      });
    }
  }
}
