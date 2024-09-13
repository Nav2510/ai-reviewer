export type Severity = "info" | "suggestion" | "issue" | "critical";

export type FindingType = "issue" | "suggestion" | "document";

export interface Finding {
  line: number;
  originalCode: string;
  suggestedChange: string;
  explanation: string;
  document: string | null;
  type: FindingType;
  severity: Severity;
  ruleId?: string;
}

export interface ReviewResult {
  changes: Finding[];
  summary: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface ProviderResponse {
  result: ReviewResult;
  usage: TokenUsage;
  model: string;
  provider: string;
  costUsd?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  content: string;
  changedLines: number[];
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  patch?: string;
  hunks: DiffHunk[];
  language?: string;
  fileContent?: string;
}

export interface ReviewInput {
  file: FileChange;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}

export interface ReviewOptions {
  temperature?: number;
  cacheKey?: string;
}
