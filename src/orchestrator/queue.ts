import type { CrawlerState, QueueTask } from "../types.js";

function now() {
  return new Date().toISOString();
}

function isDue(task: QueueTask, at: Date) {
  return Date.parse(task.dueAt) <= at.getTime();
}

function lockExpired(task: QueueTask, at: Date) {
  return !task.lockedUntil || Date.parse(task.lockedUntil) <= at.getTime();
}

export function claimNextTask(state: CrawlerState, accountId: string, lockMs: number): QueueTask | undefined {
  const at = new Date();
  const candidates = Object.values(state.tasks)
    .filter((task) => task.status === "queued" || (task.status === "running" && lockExpired(task, at)))
    .filter((task) => isDue(task, at))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    });

  const task = candidates[0];
  if (!task) return undefined;

  task.status = "running";
  task.lockedByAccountId = accountId;
  task.lockedUntil = new Date(at.getTime() + lockMs).toISOString();
  task.attempts += 1;
  task.updatedAt = now();

  const account = state.accounts[accountId];
  if (account) {
    account.status = "running";
    account.currentTaskId = task.id;
    account.updatedAt = now();
  }

  return structuredClone(task);
}

export function releaseAccount(state: CrawlerState, accountId: string, status: "idle" | "error", lastError?: string) {
  const account = state.accounts[accountId];
  if (!account) return;

  account.status = account.enabled ? status : "disabled";
  account.currentTaskId = undefined;
  account.lastRunAt = now();
  account.lastError = lastError;
  account.updatedAt = now();
}
