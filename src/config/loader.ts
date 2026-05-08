import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import { ConfigSchema, type Config, type ConfigInput } from "./schema.js";
import { PRESETS } from "./presets.js";
import { logger } from "../core/logger.js";

const DEFAULT_FILES = [
  ".ai-reviewerrc.yml",
  ".ai-reviewerrc.yaml",
  ".ai-reviewerrc.json",
  "ai-reviewer.config.yml",
  "ai-reviewer.config.yaml",
  "ai-reviewer.config.json",
];

function readFile(file: string): unknown {
  const raw = fs.readFileSync(file, "utf8");
  if (file.endsWith(".json")) return JSON.parse(raw);
  return YAML.parse(raw);
}

function deepMerge<T extends object>(base: T, over: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (typeof v === "object") {
      out[k] = deepMerge(out[k] ?? {}, v as any);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function findConfigFile(cwd: string = process.cwd()): string | undefined {
  for (const f of DEFAULT_FILES) {
    const p = path.join(cwd, f);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export function applyEnvSubstitution(cfg: ConfigInput): ConfigInput {
  const out = JSON.parse(JSON.stringify(cfg)) as ConfigInput;
  for (const p of out.providers ?? []) {
    if (p.apiKeyEnv && !p.apiKey) {
      const v = process.env[p.apiKeyEnv];
      if (v) p.apiKey = v;
    }
  }
  return out;
}

function resolveExtends(raw: ConfigInput, cwd: string): ConfigInput {
  const ext = raw.extends ?? [];
  if (ext.length === 0) return raw;
  let merged: ConfigInput = { providers: [] };
  for (const ref of ext) {
    if (ref.startsWith("preset:") || PRESETS[ref]) {
      const preset = PRESETS[ref] ?? PRESETS[`preset:${ref}`];
      if (preset) merged = deepMerge(merged as any, preset as any);
      continue;
    }
    const file = path.isAbsolute(ref) ? ref : path.join(cwd, ref);
    if (fs.existsSync(file)) {
      const data = readFile(file) as ConfigInput;
      const resolved = resolveExtends(data, path.dirname(file));
      merged = deepMerge(merged as any, resolved as any);
    } else {
      logger.warn({ ref }, "extends target not found");
    }
  }
  return deepMerge(merged as any, raw as any);
}

export function loadConfig(filePath?: string, cwd: string = process.cwd()): Config {
  const file = filePath ?? findConfigFile(cwd);
  let raw: ConfigInput;
  if (file && fs.existsSync(file)) {
    raw = readFile(file) as ConfigInput;
  } else {
    raw = inferFromEnv();
  }
  const resolved = resolveExtends(raw, file ? path.dirname(file) : cwd);
  const withEnv = applyEnvSubstitution(resolved);
  return ConfigSchema.parse(withEnv);
}

function inferFromEnv(): ConfigInput {
  const providers: ConfigInput["providers"] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      kind: "openai",
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      apiKeyEnv: "OPENAI_API_KEY",
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      name: "anthropic",
      kind: "anthropic",
      model: process.env.AI_MODEL_ANTHROPIC ?? "claude-sonnet-4-6",
      apiKeyEnv: "ANTHROPIC_API_KEY",
    });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: "gemini",
      kind: "gemini",
      model: process.env.AI_MODEL_GEMINI ?? "gemini-1.5-pro",
      apiKeyEnv: "GEMINI_API_KEY",
    });
  }
  if (providers.length === 0) {
    throw new Error(
      "No provider configured. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY or create .ai-reviewerrc.yml.",
    );
  }
  const include = process.env.SRC_FOLDER_PATTERN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    providers,
    review: include ? { include } : undefined,
  } as ConfigInput;
}
