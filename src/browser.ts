import fs from "node:fs";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { CrawlerConfig } from "./types.js";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export function assertAuthStateExists(config: CrawlerConfig) {
  if (!fs.existsSync(config.authStatePath)) {
    throw new Error(
      `Missing Reddit auth state at ${config.authStatePath}. Run \`pnpm login\` first, then log in to Reddit manually.`,
    );
  }
}

export async function createBrowserSession(config: CrawlerConfig): Promise<BrowserSession> {
  assertAuthStateExists(config);

  const browser = await chromium.launch({
    headless: config.headless,
    proxy: config.proxy,
  });

  const context = await browser.newContext({
    storageState: config.authStatePath,
    userAgent: config.userAgent,
    viewport: {
      width: 1440,
      height: 1400,
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(45_000);

  return { browser, context, page };
}
