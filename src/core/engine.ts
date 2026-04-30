import { minimatch } from "minimatch";
import { logger } from "./logger.js";
import { mapWithLimit } from "./concurrency.js";
import { changedLineSet } from "./diff.js";
import { filterFindings } from "./filter.js";
import { clusterFindings, type FileFindings } from "./cluster.js";
import { hashKey, type ReviewCache } from "./cache.js";
import type { FileChange, Finding, ProviderResponse } from "./types.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { Reporter, ReviewReport } from "../reporters/base.js";
import { aggregate } from "../reporters/base.js";
import { buildSystemPrompt, buildUserPrompt } from "../prompts/templates.js";
import { rulesForFile, type CustomRule } from "../rules/loader.js";
import type { Config } from "../config/schema.js";

export interface EngineDeps {
  config: Config;
  registry: ProviderRegistry;
  reporters: Reporter[];
  cache: ReviewCache<ProviderResponse>;
}

export interface EngineRunInput {
  files: FileChange[];
  startedAt?: string;
}

export class ReviewEngine {
  constructor(private deps: EngineDeps) {}

  shouldReview(file: FileChange): boolean {
    const { include, exclude } = this.deps.config.review;
    if (file.status === "removed") return false;
    if (exclude.some((g) => minimatch(file.path, g))) return false;
    if (include.length && !include.some((g) => minimatch(file.path, g))) return false;
    if (file.hunks.length === 0 && this.deps.config.review.mode === "diff") return false;
    return true;
  }

  async run(input: EngineRunInput): Promise<ReviewReport> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const files = input.files.filter((f) => this.shouldReview(f));
    const cfg = this.deps.config;

    let runningCost = 0;

    const results = await mapWithLimit(
      files,
      async (file) => {
        try {
          if (cfg.review.maxCostUsd && runningCost >= cfg.review.maxCostUsd) {
            logger.warn({ file: file.path, runningCost }, "Cost budget reached, skipping file");
            return null;
          }
          const provider = this.deps.registry.resolveForFile(file.path);
          const fileRules = rulesForFile(cfg.rules as CustomRule[], file);
          const ctx = {
            file,
            mode: cfg.review.mode,
            contextLines: cfg.review.contextLines,
            rules: fileRules,
            systemAddendum: cfg.prompts.systemAddendum,
          };
          const systemPrompt = buildSystemPrompt(ctx);
          const userPrompt = buildUserPrompt(ctx);

          const cacheKey = hashKey([
            provider.name,
            provider.model,
            file.path,
            file.patch ?? "",
            cfg.review.mode,
            systemPrompt,
          ]);
          const cached = await this.deps.cache.get(cacheKey);
          let response: ProviderResponse;
          if (cached) {
            logger.info({ file: file.path, cacheKey }, "Cache hit");
            response = cached;
          } else {
            response = await this.deps.registry.reviewWithFallback(provider.name, {
              file,
              systemPrompt,
              userPrompt,
              maxOutputTokens: 2000,
            });
            await this.deps.cache.set(cacheKey, response);
          }

          if (response.costUsd) runningCost += response.costUsd;

          const changedLines = changedLineSet(file);
          const findings: Finding[] = filterFindings(response.result.changes, {
            minSeverity: cfg.review.minSeverity,
            maxPerFile: cfg.review.maxCommentsPerFile,
            changedLines,
            diffOnly: cfg.review.mode === "diff",
          });

          return { path: file.path, response, findings };
        } catch (err) {
          logger.error({ err, file: file.path }, "Review failed for file");
          return null;
        }
      },
      { concurrency: cfg.review.concurrency },
    );

    const valid = results.filter((r): r is { path: string; response: ProviderResponse; findings: Finding[] } => r !== null);
    const fileFindings: FileFindings[] = valid.map((r) => ({ path: r.path, findings: r.findings }));
    const clusters = clusterFindings(fileFindings);
    const report = aggregate(valid, startedAt, clusters);

    for (const reporter of this.deps.reporters) {
      try {
        await reporter.publish(report);
      } catch (err) {
        logger.error({ err, reporter: reporter.name }, "Reporter failed");
      }
    }
    return report;
  }
}
