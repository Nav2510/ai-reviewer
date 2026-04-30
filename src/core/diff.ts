import parseDiff from "parse-diff";
import type { DiffHunk, FileChange } from "./types.js";

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  md: "markdown",
  sql: "sql",
};

export function detectLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

export function parsePatchToHunks(patch: string): DiffHunk[] {
  if (!patch) return [];
  const wrapped = patch.startsWith("diff ") ? patch : `diff --git a/x b/x\n--- a/x\n+++ b/x\n${patch}`;
  const files = parseDiff(wrapped);
  const hunks: DiffHunk[] = [];
  for (const f of files) {
    for (const c of f.chunks) {
      const changedLines: number[] = [];
      const lines: string[] = [];
      for (const line of c.changes) {
        if (line.type === "add") {
          if ("ln" in line && typeof line.ln === "number") changedLines.push(line.ln);
          lines.push(`+${line.content.startsWith("+") ? line.content.slice(1) : line.content}`);
        } else if (line.type === "del") {
          lines.push(`-${line.content.startsWith("-") ? line.content.slice(1) : line.content}`);
        } else {
          lines.push(` ${line.content.startsWith(" ") ? line.content.slice(1) : line.content}`);
        }
      }
      hunks.push({
        oldStart: c.oldStart,
        oldLines: c.oldLines,
        newStart: c.newStart,
        newLines: c.newLines,
        header: c.content,
        content: lines.join("\n"),
        changedLines,
      });
    }
  }
  return hunks;
}

export interface BuildFileChangeInput {
  filename: string;
  status: string;
  patch?: string;
  fileContent?: string;
}

export function buildFileChange(input: BuildFileChangeInput): FileChange {
  const status = (input.status as FileChange["status"]) ?? "modified";
  return {
    path: input.filename,
    status,
    patch: input.patch,
    hunks: input.patch ? parsePatchToHunks(input.patch) : [],
    language: detectLanguage(input.filename),
    fileContent: input.fileContent,
  };
}

export function changedLineSet(file: FileChange): Set<number> {
  const s = new Set<number>();
  for (const h of file.hunks) for (const ln of h.changedLines) s.add(ln);
  return s;
}
