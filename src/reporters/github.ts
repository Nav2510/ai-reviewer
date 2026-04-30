import { Octokit } from "@octokit/rest";
import { logger } from "../core/logger.js";
import { withRetry } from "../core/retry.js";
import type { Reporter, ReviewReport } from "./base.js";

export interface GitHubReporterConfig {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  updatePrDescription?: boolean;
  publishSummaryComment?: boolean;
  baseUrl?: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "🔴 critical",
  issue: "🟠 issue",
  suggestion: "🟡 suggestion",
  info: "🔵 info",
};

export class GitHubReporter implements Reporter {
  readonly name = "github";
  private octokit: Octokit;
  constructor(private cfg: GitHubReporterConfig) {
    this.octokit = new Octokit({ auth: cfg.token, baseUrl: cfg.baseUrl });
  }

  async publish(report: ReviewReport): Promise<void> {
    await this.publishBatchedReview(report);
    if (this.cfg.publishSummaryComment !== false) await this.publishSummaryComment(report);
    if (this.cfg.updatePrDescription) await this.updateDescription(report);
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
    if (comments.length === 0) {
      logger.info("No findings to report");
      return;
    }

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
    logger.info({ count: comments.length }, "Posted batched review");
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
    const marker = "<!-- aireviewer:summary -->";
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
      lines.push("", "<details><summary>Suggested doc</summary>", "", finding.document, "</details>");
    }
    return lines.join("\n");
  }

  private renderSummary(report: ReviewReport): string {
    const fileLines = report.files
      .map((f) => `- \`${f.path}\` — ${f.findings.length} finding(s) [${f.provider}/${f.model}]`)
      .join("\n");
    const clusterLines = report.clusters
      .filter((c) => c.count > 1)
      .slice(0, 5)
      .map((c) => `- **${c.severity} · ${c.type}** ×${c.count} — ${c.examples[0]?.explanation ?? ""}`)
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
