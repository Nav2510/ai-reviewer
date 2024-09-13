import { z } from "zod";
import { minimatch } from "minimatch";
import type { FileChange } from "../core/types.js";

export const RuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: z.enum(["info", "suggestion", "issue", "critical"]).default("suggestion"),
  files: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
});

export type CustomRule = z.infer<typeof RuleSchema>;

export function rulesForFile(rules: CustomRule[], file: FileChange): CustomRule[] {
  return rules.filter((r) => {
    if (!r.files || r.files.length === 0) return true;
    return r.files.some((g) => minimatch(file.path, g));
  });
}
