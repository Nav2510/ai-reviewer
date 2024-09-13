import { Octokit } from "@octokit/rest";
import { logger } from "../core/logger.js";
import { withRetry } from "../core/retry.js";
import { severityRank } from "../core/filter.js";
import type { Severity } from "../core/types.js";
import type { Reporter, ReviewReport } from "./base.js";

export interface AutoApproveConfig {
  enabled: boolean;
  maxSeverity: Severity;
  requestChangesAbove: boolean;
}

export interface GitHubReporterConfig {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  updatePrDescription?: boolean;
  publishSummaryComment?: boolean;
  baseUrl?: string;
  resolveStaleComments?: boolean;
  autoApprove?: AutoApproveConfig;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "🔴 critical",
  issue: "🟠 issue",
  suggestion: "🟡 suggestion",
  info: "🔵 info",
};

const FINDING_MARKER = "<!-- ai-reviewer:finding -->";

type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

interface ThreadNode {
  id: string;
  isResolved: boolean;
  comments: { nodes: Array<{ author: { login: string } | null; body: string; path: string; line: number | null }> };
}

export class GitHubReporter implements Reporter {
  readonly name = "github";
  private octokit: Octokit;
  constructor(private cfg: GitHubReporterConfig) {
    this.octokit = new Octokit({ auth: cfg.token, baseUrl: cfg.baseUrl });
  }

  async publish(report: ReviewReport): Promise<void> {
    if (this.cfg.resolveStaleComments) {
      try {
        await this.resolveStaleThreads(report);
      } catch (err) {
        logger.warn({ err }, "Failed to resolve stale threads");
      }
    }
    await this.publishBatchedReview(report);
    if (this.cfg.publishSummaryComment !== false) await this.publishSummaryComment(report);
    if (this.cfg.updatePrDescription) await this.updateDescription(report);
  }

  private chooseReviewEvent(report: ReviewReport): ReviewEvent {
    const auto = this.cfg.autoApprove;
    if (!auto?.enabled) return "COMMENT";
    const cap = severityRank(auto.maxSeverity);
    let exceeded = false;
    for (const f of report.files) {
      for (const finding of f.findings) {
        if (severityRank(finding.severity) > cap) {
          exceeded = true;
          break;
        }
      }
      if (exceeded) break;
    }
    if (!exceeded) return "APPROVE";
    return auto.requestChangesAbove ? "REQUEST_CHANGES" : "COMMENT";
  }

  private async publishBatchedReview(report: ReviewReport): Promise<void> {
    const comments = report.files.flatMap((f) =>
      f.findings.map((finding) => ({
        path: f.path,
        line: Math.max(1, finding.line),
        side: "RIGHT" as const,
        body: this.renderComment(finding),
      })),
    );
    const event = this.chooseReviewEvent(report);
    if (comments.length === 0 && event !== "APPROVE") {
      logger.info("No findings to report");
      return;
    }

    try {
      await withRetry(() =>
        this.octokit.pulls.createReview({
          owner: this.cfg.owner,
          repo: this.cfg.repo,
          pull_number: this.cfg.pullNumber,
          commit_id: this.cfg.commitId,
          event,
          comments,
        }),
      );
      logger.info({ count: comments.length, event }, "Posted review");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (event === "APPROVE" && /your own pull request|cannot approve/i.test(msg)) {
        logger.warn({ err: msg }, "Cannot self-approve PR; falling back to COMMENT");
        await withRetry(() =>
          this.octokit.pulls.createReview({
            owner: this.cfg.owner,
            repo: this.cfg.repo,
            pull_number: this.cfg.pullNumber,
            commit_id: this.cfg.commitId,
            event: "COMMENT",
            comments,
          }),
        );
        return;
      }
      throw err;
    }
  }

  private async publishSummaryComment(report: ReviewReport): Promise<void> {
    const body = this.renderSummary(report);
    await withRetry(() =>
      this.octokit.issues.createComment({
        owner: this.cfg.owner,
        repo: this.cfg.repo,
        issue_number: this.cfg.pullNumber,
        body,
      }),
    );
  }

  private async updateDescription(report: ReviewReport): Promise<void> {
    const { data: pr } = await this.octokit.pulls.get({
      owner: this.cfg.owner,
      repo: this.cfg.repo,
      pull_number: this.cfg.pullNumber,
    });
    const marker = "<!-- ai-reviewer:summary -->";
    const block = `${marker}\n## AI Review Summary\n${report.files
      .map((f) => `### \`${f.path}\`\n${f.summary}`)
      .join("\n\n")}\n${marker}`;
    const existing = pr.body ?? "";
    const stripped = existing.replace(new RegExp(`${marker}[\\s\\S]*?${marker}`), "").trim();
    const updated = `${block}\n\n${stripped}`.trim();
    await this.octokit.pulls.update({
      owner: this.cfg.owner,
      repo: this.cfg.repo,
      pull_number: this.cfg.pullNumber,
      body: updated,
    });
  }

  private async resolveStaleThreads(report: ReviewReport): Promise<void> {
    const currentKeys = new Set<string>();
    for (const f of report.files) {
      for (const finding of f.findings) {
        currentKeys.add(`${f.path}:${finding.line}`);
      }
    }

    const threads = await this.fetchReviewThreads();
    let resolved = 0;
    for (const t of threads) {
      if (t.isResolved) continue;
      const first = t.comments.nodes[0];
      if (!first || !first.body.includes(FINDING_MARKER)) continue;
      if (first.line == null) continue;
      const key = `${first.path}:${first.line}`;
      if (currentKeys.has(key)) continue;
      try {
        await this.octokit.graphql(
          `mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }`,
          { id: t.id },
        );
        resolved++;
      } catch (err) {
        logger.debug({ err, threadId: t.id }, "Failed to resolve thread");
      }
    }
    if (resolved > 0) logger.info({ resolved }, "Resolved stale review threads");
  }

  private async fetchReviewThreads(): Promise<ThreadNode[]> {
    const all: ThreadNode[] = [];
    let after: string | null = null;
    for (;;) {
      const res: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
              nodes: ThreadNode[];
            };
          };
        };
      } = await this.octokit.graphql(
        `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes { author { login } body path line }
                  }
                }
              }
            }
          }
        }`,
        {
          owner: this.cfg.owner,
          repo: this.cfg.repo,
          number: this.cfg.pullNumber,
          after,
        },
      );
      const page = res.repository.pullRequest.reviewThreads;
      all.push(...page.nodes);
      if (!page.pageInfo.hasNextPage) break;
      after = page.pageInfo.endCursor;
    }
    return all;
  }

  private renderComment(finding: {
    type: string;
    severity: string;
    suggestedChange: string;
    explanation: string;
    document: string | null;
  }): string {
    const badge = SEVERITY_BADGE[finding.severity] ?? finding.severity;
    const lines = [`**${badge} · ${finding.type}**`, "", finding.explanation];
    if (finding.suggestedChange) {
      lines.push("", "```suggestion", finding.suggestedChange, "```");
    }
    if (finding.document) {
      lines.push(
        "",
        "<details><summary>Suggested doc</summary>",
        "",
        finding.document,
        "</details>",
      );
    }
    lines.push("", FINDING_MARKER);
    return lines.join("\n");
  }

  private renderSummary(report: ReviewReport): string {
    const fileLines = report.files
      .map((f) => `- \`${f.path}\` — ${f.findings.length} finding(s) [${f.provider}/${f.model}]`)
      .join("\n");
    const clusterLines = report.clusters
      .filter((c) => c.count > 1)
      .slice(0, 5)
      .map(
        (c) => `- **${c.severity} · ${c.type}** ×${c.count} — ${c.examples[0]?.explanation ?? ""}`,
      )
      .join("\n");
    const cost = report.totalCostUsd ? `$${report.totalCostUsd.toFixed(4)}` : "n/a";
    return [
      "## 🤖 AI Reviewer",
      "",
      `**Files reviewed:** ${report.files.length}  ·  **Cost:** ${cost}  ·  **Tokens (in/out):** ${report.totalInputTokens}/${report.totalOutputTokens}`,
      "",
      fileLines,
      clusterLines ? `\n### Recurring patterns\n${clusterLines}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}
