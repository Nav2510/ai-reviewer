import type { FileChange } from "../core/types.js";
import type { CustomRule } from "../rules/loader.js";
import { renderHunksForPrompt } from "../core/chunker.js";

export interface PromptContext {
  file: FileChange;
  systemAddendum?: string;
  rules: CustomRule[];
  mode: "diff" | "full-file" | "hybrid";
  contextLines: number;
}

const BASE_SYSTEM = `You are a precise, terse code-review assistant.
Your output MUST conform to the supplied schema.
For each finding, set:
- "line" to the line number in the file's NEW (post-change) view
- "severity" to one of: info, suggestion, issue, critical
- "type" to one of: issue, suggestion, document
- "rule_id" if the finding maps to a known rule
Prefer fewer, higher-signal findings over noisy ones.
Skip purely stylistic nits unless explicitly requested by rules.`;

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts = [BASE_SYSTEM];
  if (ctx.rules.length > 0) {
    parts.push("\nProject rules:");
    for (const r of ctx.rules) {
      parts.push(`- [${r.id}] (${r.severity}) ${r.description}`);
    }
  }
  if (ctx.systemAddendum) parts.push(`\nTeam addendum:\n${ctx.systemAddendum}`);
  return parts.join("\n");
}

export function buildUserPrompt(ctx: PromptContext): string {
  const { file, mode } = ctx;
  const header = `File: ${file.path}\nLanguage: ${file.language ?? "unknown"}\nStatus: ${file.status}`;

  if (mode === "full-file" && file.fileContent) {
    return `${header}\n\nReview the entire file:\n\n\`\`\`${file.language ?? ""}\n${file.fileContent}\n\`\`\``;
  }

  if (mode === "hybrid" && file.fileContent && file.fileContent.length < 8000) {
    return `${header}\n\nFull file (for context):\n\`\`\`${file.language ?? ""}\n${file.fileContent}\n\`\`\`\n\nFocus your review on these changed hunks:\n${renderHunksForPrompt(file.hunks)}`;
  }

  return `${header}\n\nReview the following diff. Comment ONLY on changed lines:\n\n${renderHunksForPrompt(file.hunks)}`;
}
