import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

async function main() {
  const config = loadConfig();
  await fs.mkdir(path.dirname(config.authStatePath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    proxy: config.proxy,
  });

  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: {
      width: 1440,
      height: 1400,
    },
  });

  const page = await context.newPage();
  await page.goto("https://www.reddit.com/login/", { waitUntil: "domcontentloaded" });

  logger.info("Log in to Reddit in the opened browser window, then press Enter in this terminal.");
  await waitForEnter();

  await context.storageState({ path: config.authStatePath });
  await browser.close();

  logger.info("Saved Reddit browser session", { authStatePath: config.authStatePath });
}

main().catch((error) => {
  logger.error("Failed to save Reddit login session", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
