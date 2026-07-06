import { randomUUID } from "node:crypto";

import type { CrawlTask, QueueTask } from "../types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function nowIso() {
  return new Date().toISOString();
}

export function taskIdentity(task: CrawlTask) {
  if (task.type === "home") return `home:${task.sort}`;
  if (task.type === "subredditDetails") return `subreddit-details:${task.target.toLowerCase()}`;
  return `${task.type}:${task.target.toLowerCase()}:${task.sort}`;
}

export function nextNoonUtc(from = new Date()) {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12, 0, 0, 0));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function previousNoonUtc(from = new Date()) {
  const previous = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12, 0, 0, 0));
  if (previous.getTime() > from.getTime()) previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

export function topOfNextHour(from = new Date()) {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function dueAtForMainTask(task: CrawlTask, from = new Date()) {
  if (task.type === "home" || task.type === "subreddit") {
    if (task.sort === "best") return previousNoonUtc(from).toISOString();
    if (task.sort === "new") return new Date(from.getTime() - HOUR_MS).toISOString();
  }

  if (task.type === "subredditDetails") return new Date(from.getTime() - DAY_MS).toISOString();
  return from.toISOString();
}

export function nextDueAfterTask(task: CrawlTask, from = new Date()) {
  if (task.type === "home" || task.type === "subreddit") {
    if (task.sort === "best") return nextNoonUtc(from).toISOString();
    if (task.sort === "new") return topOfNextHour(from).toISOString();
  }

  if (task.type === "subredditDetails") return new Date(from.getTime() + DAY_MS).toISOString();
  return new Date(from.getTime() + 6 * HOUR_MS).toISOString();
}

export function makeQueueTask(task: CrawlTask, dueAt: string, priority: number): QueueTask {
  const ts = nowIso();
  return {
    id: taskIdentity(task),
    task,
    status: "queued",
    priority,
    dueAt,
    attempts: 0,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function makeOneOffQueueTask(task: CrawlTask, priority: number): QueueTask {
  const ts = nowIso();
  return {
    id: `${taskIdentity(task)}:${randomUUID()}`,
    task,
    status: "queued",
    priority,
    dueAt: ts,
    attempts: 0,
    createdAt: ts,
    updatedAt: ts,
  };
}
