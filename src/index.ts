import process from "node:process";

import { loadConfig } from "./config.js";
import { startDashboardServer } from "./dashboard/server.js";
import { logger } from "./logger.js";
import { AutonomousCrawlerRunner } from "./orchestrator/runner.js";
import { StateStore } from "./state/store.js";

async function main() {
  const config = loadConfig();
  const store = new StateStore(config.statePath, config.prioritySubreddits);
  await store.load();

  startDashboardServer(config, store);

  const runner = new AutonomousCrawlerRunner(config, store);
  await runner.start();

  const shutdown = () => {
    logger.info("Stopping crawler");
    runner.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Crawler crashed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
