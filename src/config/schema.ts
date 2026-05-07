import { z } from "zod";
import { RuleSchema } from "../rules/loader.js";

const ProviderConfigSchema = z.object({
  name: z.string(),
  kind: z.enum(["openai", "anthropic", "gemini", "ollama"]),
  model: z.string(),
  apiKey: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  costPerInputToken: z.number().nonnegative().optional(),
  costPerOutputToken: z.number().nonnegative().optional(),
  enablePromptCache: z.boolean().optional(),
});

const RouteSchema = z.object({
  match: z.string(),
  provider: z.string(),
});

const AutoApproveSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxSeverity: z
      .enum(["info", "suggestion", "issue", "critical"])
      .default("suggestion"),
    requestChangesAbove: z.boolean().default(false),
  })
  .default({});

const ReporterSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("github"),
    publishSummaryComment: z.boolean().optional(),
    updatePrDescription: z.boolean().optional(),
    resolveStaleComments: z.boolean().optional(),
    autoApprove: AutoApproveSchema.optional(),
  }),
  z.object({ kind: z.literal("stdout") }),
  z.object({ kind: z.literal("json"), path: z.string() }),
]);

export const ConfigSchema = z
  .object({
    extends: z.array(z.string()).optional(),
    providers: z.array(ProviderConfigSchema).min(1),
    defaultProvider: z.string().optional(),
    fallback: z.array(z.string()).optional(),
    routes: z.array(RouteSchema).optional(),
    review: z
      .object({
        include: z.array(z.string()).default(["**/src/**/*.{ts,tsx,js,jsx}"]),
        exclude: z
          .array(z.string())
          .default(["**/*.test.*", "**/*.spec.*", "dist/**", "node_modules/**"]),
        mode: z.enum(["diff", "full-file", "hybrid"]).default("diff"),
        contextLines: z.number().int().min(0).max(50).default(3),
        minSeverity: z.enum(["info", "suggestion", "issue", "critical"]).default("suggestion"),
        maxCommentsPerFile: z.number().int().positive().default(8),
        maxCostUsd: z.number().nonnegative().optional(),
        skipLabels: z.array(z.string()).default(["no-ai-review", "wip"]),
        concurrency: z.number().int().positive().default(4),
        cache: z.enum(["off", "memory", "file"]).default("file"),
        cacheDir: z.string().default(".ai-reviewer-cache"),
      })
      .default({}),
    rules: z.array(RuleSchema).default([]),
    prompts: z
      .object({
        systemAddendum: z.string().optional(),
      })
      .default({}),
    reporters: z.array(ReporterSchema).default([{ kind: "github" }]),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
