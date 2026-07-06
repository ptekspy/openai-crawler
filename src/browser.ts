import fs from "node:fs";

import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";

import type { CrawlerAccount, CrawlerConfig } from "./types.js";

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

function contextOptions(config: CrawlerConfig, account?: CrawlerAccount): BrowserContextOptions {
  const storageState = account?.authStatePath || config.authStatePath;
  const options: BrowserContextOptions = {
    userAgent: config.userAgent,
    viewport: {
      width: 1440,
      height: 1400,
    },
  };

  if (storageState && fs.existsSync(storageState)) options.storageState = storageState;
  return options;
}

async function applySessionCookie(context: BrowserContext, account?: CrawlerAccount) {
  const sessionCookie = account?.sessionCookie?.trim();
  if (!sessionCookie) return;

  await context.addCookies([
    {
      name: "reddit_session",
      value: sessionCookie,
      domain: ".reddit.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

export async function createBrowserSession(config: CrawlerConfig, account?: CrawlerAccount): Promise<BrowserSession> {
  if (!account) assertAuthStateExists(config);

  const browser = await chromium.launch({
    headless: config.headless,
    proxy: config.proxy,
  });

  const context = await browser.newContext(contextOptions(config, account));
  await applySessionCookie(context, account);

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(45_000);

  return { browser, context, page };
}
