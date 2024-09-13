import * as core from "@actions/core";
import { context } from "@actions/github";
import { Octokit } from "@octokit/rest";
import { ReviewEngine } from "../core/engine.js";
import { buildFileChange } from "../core/diff.js";
import { logger } from "../core/logger.js";
import { loadConfig } from "../config/loader.js";
import { buildRegistry, buildCache, buildReporters } from "./setup.js";

async function loadFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number,
) {
  logger.debug({ owner, repo, pull_number }, "Fetching PR files from GitHub");
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  logger.debug(
    {
      count: files.length,
      sample: files.slice(0, 10).map((f) => ({
        filename: f.filename,
        status: f.status,
        patchBytes: f.patch?.length ?? 0,
      })),
    },
    "PR files fetched",
  );
  return files.map((f) =>
    buildFileChange({ filename: f.filename, status: f.status, patch: f.patch }),
  );
}

export async function runAction(): Promise<void> {
  try {
    logger.debug(
      {
        eventName: context.eventName,
        actor: context.actor,
        runnerDebug: process.env.RUNNER_DEBUG === "1",
        stepDebug: process.env.ACTIONS_STEP_DEBUG === "true",
        nodeVersion: process.version,
      },
      "Action runner starting",
    );

    const token = process.env.GITHUB_TOKEN ?? core.getInput("github-token");
    if (!token) throw new Error("GITHUB_TOKEN is required");
    if (!context.payload.pull_request) throw new Error("This action runs only on pull_request events");

    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request.number;

    const labels: string[] = (context.payload.pull_request.labels ?? []).map(
      (l: { name: string }) => l.name,
    );

    logger.debug(
      {
        owner,
        repo,
        pull_number,
        labels,
        baseRef: context.payload.pull_request.base?.ref,
        headRef: context.payload.pull_request.head?.ref,
        headSha: context.payload.pull_request.head?.sha,
      },
      "Resolved PR context",
    );

    const configInput = core.getInput("config") || undefined;
    logger.debug({ configInput }, "Loading config");
    const cfg = loadConfig(configInput);
    logger.debug(
      {
        mode: cfg.review.mode,
        include: cfg.review.include,
        exclude: cfg.review.exclude,
        skipLabels: cfg.review.skipLabels,
        minSeverity: cfg.review.minSeverity,
        concurrency: cfg.review.concurrency,
        maxCostUsd: cfg.review.maxCostUsd,
        maxCommentsPerFile: cfg.review.maxCommentsPerFile,
        contextLines: cfg.review.contextLines,
        rules: Array.isArray(cfg.rules) ? cfg.rules.length : 0,
      },
      "Config loaded",
    );

    if (cfg.review.skipLabels.some((l) => labels.includes(l))) {
      logger.info({ labels, skipLabels: cfg.review.skipLabels }, "Skipping review per label");
      return;
    }

    const octokit = new Octokit({ auth: token });
    const files = await loadFiles(octokit, owner, repo, pull_number);
    const { data: commits } = await octokit.pulls.listCommits({ owner, repo, pull_number });
    const commitId = commits[commits.length - 1]?.sha;
    if (!commitId) throw new Error("Could not resolve head commit");
    logger.debug({ commitId, commitCount: commits.length }, "Resolved head commit");

    const registry = buildRegistry(cfg);
    const cache = buildCache(cfg);
    const reporters = buildReporters(cfg, {
      token,
      owner,
      repo,
      pullNumber: pull_number,
      commitId,
    });
    logger.debug(
      { reporters: reporters.map((r) => r.name) },
      "Engine dependencies built",
    );

    const engine = new ReviewEngine({ config: cfg, registry, reporters, cache });
    const report = await engine.run({ files });

    core.setOutput("findings", String(report.files.reduce((s, f) => s + f.findings.length, 0)));
    core.setOutput("cost-usd", String(report.totalCostUsd));
    logger.info(
      {
        files: report.files.length,
        cost: report.totalCostUsd,
        tokens: { in: report.totalInputTokens, out: report.totalOutputTokens },
      },
      "Review complete",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Action failed");
    core.setFailed(msg);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runAction();
}
