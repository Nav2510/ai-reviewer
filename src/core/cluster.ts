import type { Finding } from "./types.js";

export interface FindingCluster {
  signature: string;
  type: Finding["type"];
  severity: Finding["severity"];
  examples: Array<{ path: string; line: number; explanation: string }>;
  count: number;
}

export interface FileFindings {
  path: string;
  findings: Finding[];
}

function signature(f: Finding): string {
  const norm = f.explanation
    .toLowerCase()
    .replace(/[\d`'"]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${f.type}:${f.ruleId ?? norm}`;
}

export function clusterFindings(input: FileFindings[]): FindingCluster[] {
  const map = new Map<string, FindingCluster>();
  for (const file of input) {
    for (const f of file.findings) {
      const sig = signature(f);
      const existing = map.get(sig);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push({ path: file.path, line: f.line, explanation: f.explanation });
        }
      } else {
        map.set(sig, {
          signature: sig,
          type: f.type,
          severity: f.severity,
          examples: [{ path: file.path, line: f.line, explanation: f.explanation }],
          count: 1,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
