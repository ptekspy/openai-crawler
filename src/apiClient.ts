import { logger } from "./logger.js";
import type { ApiTargetsResponse, CrawlResult, CrawlerConfig } from "./types.js";
import { joinUrl, safeJsonStringify } from "./utils.js";

function headers(config: CrawlerConfig): HeadersInit {
  return {
    "content-type": "application/json",
    ...(config.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}),
  };
}

export class ApiClient {
  constructor(private readonly config: CrawlerConfig) {}

  get isEnabled() {
    return Boolean(this.config.apiUrl);
  }

  async fetchTargets(): Promise<ApiTargetsResponse> {
    if (!this.config.apiUrl) return {};

    const url = joinUrl(this.config.apiUrl, this.config.apiTargetsPath);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: headers(this.config),
      });

      if (!response.ok) {
        logger.warn("API targets request failed", {
          status: response.status,
          url,
        });
        return {};
      }

      return (await response.json()) as ApiTargetsResponse;
    } catch (error) {
      logger.warn("API targets request errored", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  async sendResult(result: CrawlResult): Promise<void> {
    if (!this.config.apiUrl) {
      logger.info("Dry-run result", {
        task: result.task,
        payloadCount: result.payloadCount,
        posts: result.posts.length,
        errors: result.errors.length,
      });
      return;
    }

    const url = joinUrl(this.config.apiUrl, this.config.apiImportPath);

    const response = await fetch(url, {
      method: "POST",
      headers: headers(this.config),
      body: safeJsonStringify(result),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`API import failed: ${response.status} ${response.statusText} ${body}`);
    }

    logger.info("Sent crawl result to API", {
      task: result.task,
      posts: result.posts.length,
    });
  }
}
