import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createBrowserSession } from "./browser.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { sleep } from "./utils.js";

function safeFileName(input: string) {
  return input.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function main() {
  const config = loadConfig();
  const url = process.argv[2] || "https://www.reddit.com/r/daresgonewild/new/";
  const outputDir = process.env.CRAWLER_SNAPSHOT_DIR || "snapshots";

  await fs.mkdir(outputDir, { recursive: true });

  const session = await createBrowserSession({
    ...config,
    headless: false,
  });

  try {
    await session.page.goto(url, { waitUntil: "domcontentloaded" });
    await session.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    for (let i = 0; i < Math.min(config.scrollSteps, 4); i += 1) {
      await session.page.mouse.wheel(0, 1800);
      await sleep(config.scrollDelayMs);
    }

    const html = await session.page.content();
    const filePath = path.join(outputDir, `${Date.now()}-${safeFileName(url)}.html`);
    await fs.writeFile(filePath, html, "utf8");

    logger.info("Saved Reddit HTML snapshot", { filePath, url });
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  logger.error("Snapshot failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
