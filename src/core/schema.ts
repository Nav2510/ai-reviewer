import { z } from "zod";

export const FindingSchema = z.object({
  line: z.number().int().min(0),
  original_code: z.string(),
  suggested_change: z.string(),
  explanation: z.string(),
  document: z.string().nullable(),
  type: z.enum(["issue", "suggestion", "document"]),
  severity: z.enum(["info", "suggestion", "issue", "critical"]).default("suggestion"),
  rule_id: z.string().nullable().optional(),
});

export const ReviewResponseSchema = z.object({
  changes: z.array(FindingSchema),
  summary: z.string(),
});

export type RawFinding = z.infer<typeof FindingSchema>;
export type RawReviewResponse = z.infer<typeof ReviewResponseSchema>;

export function toJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      changes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            line: { type: "number", description: "Line number where the issue was found." },
            original_code: { type: "string" },
            suggested_change: { type: "string" },
            explanation: { type: "string" },
            document: { type: ["string", "null"] },
            type: { type: "string", enum: ["issue", "suggestion", "document"] },
            severity: {
              type: "string",
              enum: ["info", "suggestion", "issue", "critical"],
            },
            rule_id: { type: ["string", "null"] },
          },
          required: [
            "line",
            "original_code",
            "suggested_change",
            "explanation",
            "document",
            "type",
            "severity",
            "rule_id",
          ],
        },
      },
      summary: { type: "string" },
    },
    required: ["changes", "summary"],
  };
}

export function normalizeFinding(raw: RawFinding) {
  return {
    line: raw.line,
    originalCode: raw.original_code,
    suggestedChange: raw.suggested_change,
    explanation: raw.explanation,
    document: raw.document,
    type: raw.type,
    severity: raw.severity,
    ruleId: raw.rule_id ?? undefined,
  };
}
