import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/providers/registry.js";
import type { ModelProvider } from "../src/providers/base.js";
import type { ProviderResponse, ReviewInput } from "../src/core/types.js";

const mockProvider = (
  name: string,
  reviewImpl: (input: ReviewInput) => Promise<ProviderResponse>,
): ModelProvider => ({
  name,
  model: `${name}-model`,
  capabilities: {
    supportsStructuredOutput: true,
    supportsStreaming: false,
    maxContextTokens: 100,
    promptCaching: false,
  },
  countTokens: (s) => s.length,
  review: reviewImpl,
});

const baseInput: ReviewInput = {
  file: { path: "x.ts", status: "modified", hunks: [] },
  systemPrompt: "sys",
  userPrompt: "user",
  maxOutputTokens: 100,
};

describe("ProviderRegistry", () => {
  it("returns default provider when no routes match", () => {
    const r = new ProviderRegistry();
    r.register(mockProvider("p1", async () => ({} as ProviderResponse)), { default: true });
    r.register(mockProvider("p2", async () => ({} as ProviderResponse)));
    expect(r.resolveForFile("any.ts").name).toBe("p1");
  });

  it("matches routes by glob", () => {
    const r = new ProviderRegistry();
    r.register(mockProvider("default", async () => ({} as ProviderResponse)), { default: true });
    r.register(mockProvider("sql", async () => ({} as ProviderResponse)));
    r.setRoutes([{ match: "**/*.sql", provider: "sql" }]);
    expect(r.resolveForFile("db/migrations/x.sql").name).toBe("sql");
    expect(r.resolveForFile("src/x.ts").name).toBe("default");
  });

  it("falls back when primary errors", async () => {
    const r = new ProviderRegistry();
    r.register(
      mockProvider("primary", async () => {
        throw new Error("boom");
      }),
      { default: true },
    );
    r.register(
      mockProvider("backup", async () => ({
        result: { changes: [], summary: "ok" },
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "backup-model",
        provider: "backup",
      })),
    );
    r.setFallbackChain(["backup"]);
    const out = await r.reviewWithFallback("primary", baseInput);
    expect(out.provider).toBe("backup");
  });

  it("throws when all providers fail", async () => {
    const r = new ProviderRegistry();
    r.register(mockProvider("a", async () => { throw new Error("a"); }), { default: true });
    r.register(mockProvider("b", async () => { throw new Error("b"); }));
    r.setFallbackChain(["b"]);
    await expect(r.reviewWithFallback("a", baseInput)).rejects.toThrow();
  });
});
