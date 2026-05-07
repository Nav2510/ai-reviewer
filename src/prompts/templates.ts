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

LINE NUMBERS:
Each line in the diff is prefixed with its line number in the NEW (post-change) file, formatted as "<N> + ..." for added lines, "<N>   ..." for context lines, and "  - ..." for removed lines (no number — you cannot comment on removed lines).
- Set "line" to the EXACT integer prefix of the line you are commenting on. Do not count manually — copy the number you see.
- Only comment on lines marked "+" (added) or "  " (context). Never use a line number from a "-" (removed) line.
- Set "original_code" to the verbatim text of that line (without the "<N> + " or "<N>   " prefix). This MUST match the line at the "line" number; if it doesn't, your finding is wrong — drop it.

Other fields:
- "severity" — one of: info, suggestion, issue, critical
- "type" — one of: issue, suggestion, document
- "rule_id" — set if the finding maps to a known project rule, otherwise null

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
