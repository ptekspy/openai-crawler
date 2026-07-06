import process from "node:process";

import { ApiClient } from "./apiClient.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { crawlRedditTask } from "./reddit/crawlPage.js";
import { buildTasks } from "./scheduler.js";
import { sleep } from "./utils.js";

function isOnceMode() {
  return process.argv.includes("--once");
}

async function runCycle(api: ApiClient, config = loadConfig()) {
  const apiTargets = await api.fetchTargets();
  const tasks = buildTasks(config, apiTargets);

  logger.info("Starting crawler cycle", {
    tasks: tasks.length,
    apiEnabled: api.isEnabled,
  });

  for (const task of tasks) {
    const result = await crawlRedditTask(config, task);
    await api.sendResult(result);
    await sleep(config.taskDelayMs);
  }

  logger.info("Finished crawler cycle", {
    tasks: tasks.length,
  });
}

async function main() {
  const config = loadConfig();
  const api = new ApiClient(config);
  const once = isOnceMode();

  do {
    await runCycle(api, config);

    if (once) break;

    logger.info("Sleeping before next crawler cycle", {
      delayMs: config.cycleDelayMs,
    });
    await sleep(config.cycleDelayMs);
  } while (true);
}

main().catch((error) => {
  logger.error("Crawler crashed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
