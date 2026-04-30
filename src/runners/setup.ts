import * as fs from "node:fs";
import { logger } from "../core/logger.js";
import { FileCache, InMemoryCache, NullCache, type ReviewCache } from "../core/cache.js";
import { ProviderRegistry, buildProvider } from "../providers/registry.js";
import type { Reporter } from "../reporters/base.js";
import { StdoutReporter } from "../reporters/stdout.js";
import { JsonFileReporter } from "../reporters/json.js";
import { GitHubReporter } from "../reporters/github.js";
import type { Config } from "../config/schema.js";
import type { ProviderResponse } from "../core/types.js";

export interface GitHubReporterContext {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
}

export function buildRegistry(config: Config): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const p of config.providers) {
    if (p.apiKeyEnv && !p.apiKey) p.apiKey = process.env[p.apiKeyEnv];
    const provider = buildProvider(p as any);
    const isDefault = config.defaultProvider
      ? p.name === config.defaultProvider
      : p === config.providers[0];
    registry.register(provider, { default: isDefault });
  }
  if (config.fallback?.length) registry.setFallbackChain(config.fallback);
  if (config.routes?.length) registry.setRoutes(config.routes);
  return registry;
}

export function buildCache(config: Config): ReviewCache<ProviderResponse> {
  switch (config.review.cache) {
    case "off":
      return new NullCache<ProviderResponse>();
    case "memory":
      return new InMemoryCache<ProviderResponse>();
    case "file":
      fs.mkdirSync(config.review.cacheDir, { recursive: true });
      return new FileCache<ProviderResponse>(config.review.cacheDir);
  }
}

export function buildReporters(
  config: Config,
  ghCtx: GitHubReporterContext | undefined,
): Reporter[] {
  const reporters: Reporter[] = [];
  for (const r of config.reporters) {
    if (r.kind === "github") {
      if (!ghCtx) {
        logger.warn("github reporter configured but no GitHub context available; skipping");
        continue;
      }
      reporters.push(
        new GitHubReporter({
          ...ghCtx,
          publishSummaryComment: r.publishSummaryComment,
          updatePrDescription: r.updatePrDescription,
        }),
      );
    } else if (r.kind === "stdout") {
      reporters.push(new StdoutReporter());
    } else if (r.kind === "json") {
      reporters.push(new JsonFileReporter(r.path));
    }
  }
  if (reporters.length === 0) reporters.push(new StdoutReporter());
  return reporters;
}
