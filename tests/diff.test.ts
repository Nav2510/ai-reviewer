import { describe, expect, it } from "vitest";
import { buildFileChange, changedLineSet, detectLanguage, parsePatchToHunks } from "../src/core/diff.js";

const SAMPLE_PATCH = `@@ -1,3 +1,4 @@
 function foo(a, b) {
-  return a + b
+  return a + b;
+  // trailing
 }
`;

describe("diff", () => {
  it("detects language by extension", () => {
    expect(detectLanguage("src/x.ts")).toBe("typescript");
    expect(detectLanguage("src/x.py")).toBe("python");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("Makefile")).toBeUndefined();
  });

  it("parses a patch into hunks with changed line numbers", () => {
    const hunks = parsePatchToHunks(SAMPLE_PATCH);
    expect(hunks).toHaveLength(1);
    const h = hunks[0]!;
    expect(h.changedLines.length).toBeGreaterThanOrEqual(2);
    expect(h.content).toContain("+");
    expect(h.content).toContain("-");
  });

  it("buildFileChange + changedLineSet integrates", () => {
    const f = buildFileChange({ filename: "src/x.ts", status: "modified", patch: SAMPLE_PATCH });
    const set = changedLineSet(f);
    expect(set.size).toBeGreaterThan(0);
    expect(f.language).toBe("typescript");
  });

  it("returns empty when no patch", () => {
    expect(parsePatchToHunks("")).toEqual([]);
  });
});
