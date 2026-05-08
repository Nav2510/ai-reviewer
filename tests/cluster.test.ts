import { describe, expect, it } from "vitest";
import { clusterFindings } from "../src/core/cluster.js";
import type { Finding } from "../src/core/types.js";

const f = (path: string, line: number, explanation: string, ruleId?: string): Finding => ({
  line,
  originalCode: "",
  suggestedChange: "",
  explanation,
  document: null,
  type: "suggestion",
  severity: "suggestion",
  ruleId,
});

describe("cluster", () => {
  it("groups by ruleId when present", () => {
    const out = clusterFindings([
      { path: "a.ts", findings: [f("a.ts", 1, "x", "no-console"), f("a.ts", 2, "y", "no-console")] },
      { path: "b.ts", findings: [f("b.ts", 5, "z", "no-console")] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(3);
  });

  it("groups by normalized explanation when no ruleId", () => {
    const out = clusterFindings([
      { path: "a.ts", findings: [f("a.ts", 1, "Missing JSDoc on method")] },
      { path: "b.ts", findings: [f("b.ts", 7, "Missing JSDoc on method")] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(2);
  });

  it("sorts by count desc", () => {
    const out = clusterFindings([
      { path: "a.ts", findings: [f("a.ts", 1, "rare")] },
      { path: "b.ts", findings: [f("b.ts", 1, "common"), f("b.ts", 2, "common"), f("b.ts", 3, "common")] },
    ]);
    expect(out[0]!.count).toBe(3);
  });
});
