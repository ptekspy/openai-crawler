import type { Page, Response } from "playwright";

import { logger } from "../logger.js";
import type { CapturedPayload } from "../types.js";

function isProbablyUsefulRedditResponse(response: Response): boolean {
  const url = response.url();
  if (!url.includes("reddit.com")) return false;
  if (url.includes("/media/") || url.includes("/preview/")) return false;
  if (url.includes(".png") || url.includes(".jpg") || url.includes(".jpeg") || url.includes(".gif")) return false;

  const contentType = response.headers()["content-type"] ?? "";
  return contentType.includes("application/json") || url.includes("/svc/shreddit/") || url.includes("/graphql");
}

export function attachNetworkCapture(page: Page) {
  const payloads: CapturedPayload[] = [];
  const errors: string[] = [];

  async function handleResponse(response: Response) {
    if (!isProbablyUsefulRedditResponse(response)) return;

    try {
      const json = (await response.json()) as unknown;
      payloads.push({
        url: response.url(),
        status: response.status(),
        json,
      });
    } catch (error) {
      logger.debug("Ignored non-json Reddit response", {
        url: response.url(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  page.on("response", (response) => {
    handleResponse(response).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logger.debug("Response capture failed", { message });
    });
  });

  return {
    payloads,
    errors,
  };
}
