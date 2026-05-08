import type { Finding, ProviderResponse } from "../core/types.js";
import type { FindingCluster } from "../core/cluster.js";

export interface FileReviewReport {
  path: string;
  findings: Finding[];
  summary: string;
  provider: string;
  model: string;
  costUsd?: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ReviewReport {
  files: FileReviewReport[];
  clusters: FindingCluster[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  startedAt: string;
  finishedAt: string;
}

export interface Reporter {
  readonly name: string;
  publish(report: ReviewReport): Promise<void>;
}

export function aggregate(
  results: Array<{ path: string; response: ProviderResponse; findings: Finding[] }>,
  startedAt: string,
  clusters: FindingCluster[],
): ReviewReport {
  const files: FileReviewReport[] = results.map((r) => ({
    path: r.path,
    findings: r.findings,
    summary: r.response.result.summary,
    provider: r.response.provider,
    model: r.response.model,
    costUsd: r.response.costUsd,
    inputTokens: r.response.usage.inputTokens,
    outputTokens: r.response.usage.outputTokens,
  }));
  return {
    files,
    clusters,
    totalCostUsd: files.reduce((s, f) => s + (f.costUsd ?? 0), 0),
    totalInputTokens: files.reduce((s, f) => s + f.inputTokens, 0),
    totalOutputTokens: files.reduce((s, f) => s + f.outputTokens, 0),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
