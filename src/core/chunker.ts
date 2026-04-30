import type { DiffHunk } from "./types.js";

export function approxTokenCount(s: string): number {
  return Math.ceil(s.length / 4);
}

export interface HunkChunk {
  hunks: DiffHunk[];
  approxTokens: number;
}

export function chunkHunks(hunks: DiffHunk[], maxTokens: number): HunkChunk[] {
  const chunks: HunkChunk[] = [];
  let current: DiffHunk[] = [];
  let currentTokens = 0;

  for (const h of hunks) {
    const t = approxTokenCount(h.content);
    if (t > maxTokens) {
      if (current.length) {
        chunks.push({ hunks: current, approxTokens: currentTokens });
        current = [];
        currentTokens = 0;
      }
      chunks.push({ hunks: [h], approxTokens: t });
      continue;
    }
    if (currentTokens + t > maxTokens && current.length) {
      chunks.push({ hunks: current, approxTokens: currentTokens });
      current = [];
      currentTokens = 0;
    }
    current.push(h);
    currentTokens += t;
  }
  if (current.length) chunks.push({ hunks: current, approxTokens: currentTokens });
  return chunks;
}

export function renderHunksForPrompt(hunks: DiffHunk[]): string {
  return hunks
    .map((h) => `@@ ${h.header || `-${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines}`}\n${h.content}`)
    .join("\n\n");
}
