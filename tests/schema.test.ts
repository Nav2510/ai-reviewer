import { describe, expect, it } from "vitest";
import { ReviewResponseSchema, normalizeFinding, toJsonSchema } from "../src/core/schema.js";

describe("schema", () => {
  it("parses a valid response", () => {
    const out = ReviewResponseSchema.parse({
      changes: [
        {
          line: 12,
          original_code: "x",
          suggested_change: "y",
          explanation: "z",
          document: null,
          type: "suggestion",
          severity: "issue",
        },
      ],
      summary: "ok",
    });
    expect(out.changes).toHaveLength(1);
  });

  it("normalizeFinding maps snake to camel", () => {
    const out = normalizeFinding({
      line: 3,
      original_code: "a",
      suggested_change: "b",
      explanation: "c",
      document: null,
      type: "issue",
      severity: "issue",
      rule_id: "x",
    });
    expect(out.originalCode).toBe("a");
    expect(out.suggestedChange).toBe("b");
    expect(out.ruleId).toBe("x");
  });

  it("toJsonSchema returns required keys", () => {
    const j = toJsonSchema() as { required: string[] };
    expect(j.required).toContain("changes");
    expect(j.required).toContain("summary");
  });
});
