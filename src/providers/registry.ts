import { minimatch } from "minimatch";
import type { ProviderResponse, ReviewInput, ReviewOptions } from "../core/types.js";
import { logger } from "../core/logger.js";
import { type ModelProvider, ProviderError } from "./base.js";
import { OpenAIProvider, type OpenAIProviderConfig } from "./openai.js";
import { AnthropicProvider, type AnthropicProviderConfig } from "./anthropic.js";
import { GeminiProvider, type GeminiProviderConfig } from "./gemini.js";
import { OllamaProvider, type OllamaProviderConfig } from "./ollama.js";

export type ProviderConfig =
  | OpenAIProviderConfig
  | AnthropicProviderConfig
  | GeminiProviderConfig
  | OllamaProviderConfig;

export interface RouteRule {
  match: string;
  provider: string;
}

export function buildProvider(cfg: ProviderConfig): ModelProvider {
  switch (cfg.kind) {
    case "openai":
      return new OpenAIProvider(cfg);
    case "anthropic":
      return new AnthropicProvider(cfg);
    case "gemini":
      return new GeminiProvider(cfg);
    case "ollama":
      return new OllamaProvider(cfg);
    default: {
      const _exhaust: never = cfg;
      throw new Error(`Unknown provider kind: ${(_exhaust as { kind?: string })?.kind}`);
    }
  }
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();
  private fallback: string[] = [];
  private routes: RouteRule[] = [];
  private defaultName?: string;

  register(provider: ModelProvider, opts: { default?: boolean } = {}): this {
    this.providers.set(provider.name, provider);
    if (opts.default || !this.defaultName) this.defaultName = provider.name;
    return this;
  }

  setFallbackChain(names: string[]): this {
    this.fallback = names;
    return this;
  }

  setRoutes(routes: RouteRule[]): this {
    this.routes = routes;
    return this;
  }

  get(name: string): ModelProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Provider "${name}" not registered`);
    return p;
  }

  resolveForFile(filePath: string): ModelProvider {
    for (const r of this.routes) {
      if (minimatch(filePath, r.match)) return this.get(r.provider);
    }
    if (this.defaultName) return this.get(this.defaultName);
    throw new Error("No provider configured");
  }

  async reviewWithFallback(
    primaryName: string,
    input: ReviewInput,
    opts?: ReviewOptions,
  ): Promise<ProviderResponse> {
    const chain = [primaryName, ...this.fallback.filter((n) => n !== primaryName)];
    let lastErr: unknown;
    for (const name of chain) {
      const p = this.providers.get(name);
      if (!p) continue;
      try {
        return await p.review(input, opts);
      } catch (err) {
        lastErr = err;
        logger.warn({ provider: name, err: (err as Error)?.message }, "Provider failed, trying next");
      }
    }
    throw new ProviderError("All providers failed", primaryName, lastErr);
  }
}
