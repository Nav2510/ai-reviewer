import { describe, expect, it } from "vitest";
import { approxTokenCount, chunkHunks, renderHunksForPrompt } from "../src/core/chunker.js";
import type { DiffHunk } from "../src/core/types.js";

const mkHunk = (size: number, idx: number): DiffHunk => ({
  oldStart: idx * 10,
  oldLines: 5,
  newStart: idx * 10,
  newLines: 5,
  header: `chunk-${idx}`,
  content: "x".repeat(size),
  changedLines: [idx * 10 + 1],
});

describe("chunker", () => {
  it("approx token count is length/4", () => {
    expect(approxTokenCount("abcd")).toBe(1);
    expect(approxTokenCount("a".repeat(40))).toBe(10);
  });

  it("packs hunks under maxTokens", () => {
    const hunks = [mkHunk(40, 0), mkHunk(40, 1), mkHunk(40, 2)];
    const chunks = chunkHunks(hunks, 25);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("oversize hunk gets its own chunk", () => {
    const hunks = [mkHunk(40, 0), mkHunk(400, 1), mkHunk(40, 2)];
    const chunks = chunkHunks(hunks, 25);
    const big = chunks.find((c) => c.hunks.length === 1 && c.approxTokens > 25);
    expect(big).toBeDefined();
  });

  it("renders hunks with @@ markers", () => {
    const out = renderHunksForPrompt([mkHunk(20, 0)]);
    expect(out).toContain("@@");
  });
});
