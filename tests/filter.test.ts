import { describe, expect, it } from "vitest";
import { filterFindings } from "../src/core/filter.js";
import type { Finding } from "../src/core/types.js";

const f = (line: number, severity: Finding["severity"]): Finding => ({
  line,
  originalCode: "",
  suggestedChange: "",
  explanation: `s${severity}`,
  document: null,
  type: "issue",
  severity,
});

describe("filter", () => {
  it("drops findings below minSeverity", () => {
    const out = filterFindings([f(1, "info"), f(2, "issue"), f(3, "critical")], {
      minSeverity: "issue",
    });
    expect(out.map((x) => x.line).sort()).toEqual([2, 3]);
  });

  it("caps per file", () => {
    const out = filterFindings([f(1, "issue"), f(2, "issue"), f(3, "issue")], { maxPerFile: 2 });
    expect(out).toHaveLength(2);
  });

  it("diffOnly filters by changed lines", () => {
    const out = filterFindings([f(1, "issue"), f(2, "issue"), f(3, "issue")], {
      diffOnly: true,
      changedLines: new Set([2]),
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.line).toBe(2);
  });

  it("orders by severity desc", () => {
    const out = filterFindings([f(1, "info"), f(2, "critical"), f(3, "suggestion")], {});
    expect(out[0]!.severity).toBe("critical");
  });
});
