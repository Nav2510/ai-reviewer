import type { Finding, Severity } from "./types.js";

const ORDER: Severity[] = ["info", "suggestion", "issue", "critical"];

export function severityRank(s: Severity): number {
  return ORDER.indexOf(s);
}

export interface FilterOptions {
  minSeverity?: Severity;
  maxPerFile?: number;
  changedLines?: Set<number>;
  diffOnly?: boolean;
}

export function filterFindings(findings: Finding[], opts: FilterOptions): Finding[] {
  const min = opts.minSeverity ? severityRank(opts.minSeverity) : -1;
  let out = findings.filter((f) => severityRank(f.severity) >= min);
  if (opts.diffOnly && opts.changedLines) {
    const changed = opts.changedLines;
    out = out.filter((f) => changed.has(f.line));
  }
  out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  if (opts.maxPerFile && out.length > opts.maxPerFile) out = out.slice(0, opts.maxPerFile);
  return out;
}
