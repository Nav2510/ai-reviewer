import { Ollama } from "ollama";
import type { ProviderResponse, ReviewInput, ReviewOptions } from "../core/types.js";
import { ReviewResponseSchema, normalizeFinding, toJsonSchema } from "../core/schema.js";
import { withRetry } from "../core/retry.js";
import { logger } from "../core/logger.js";
import {
  type BaseProviderConfig,
  type ModelProvider,
  type ProviderCapabilities,
  ProviderError,
} from "./base.js";

export interface OllamaProviderConfig extends BaseProviderConfig {
  kind: "ollama";
}

export class OllamaProvider implements ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    maxContextTokens: 32_000,
    promptCaching: false,
  };
  private client: Ollama;
  private cfg: OllamaProviderConfig;

  constructor(cfg: OllamaProviderConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.model = cfg.model;
    this.client = new Ollama({ host: cfg.baseUrl ?? "http://localhost:11434" });
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async review(input: ReviewInput, _opts?: ReviewOptions): Promise<ProviderResponse> {
    const result = await withRetry(() =>
      this.client.chat({
        model: this.model,
        format: toJsonSchema() as object,
        options: {
          temperature: this.cfg.temperature ?? 0.2,
          num_predict: input.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 2000,
        },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    );

    const text = result.message?.content;
    if (!text) throw new ProviderError("Empty response from Ollama", this.name);

    let parsed;
    try {
      parsed = ReviewResponseSchema.parse(JSON.parse(text));
    } catch (err) {
      logger.error({ err, text }, "Failed to parse Ollama response");
      throw new ProviderError("Invalid response shape from Ollama", this.name, err);
    }

    const inputTokens = result.prompt_eval_count ?? this.countTokens(input.userPrompt);
    const outputTokens = result.eval_count ?? this.countTokens(text);
    return {
      result: { changes: parsed.changes.map(normalizeFinding), summary: parsed.summary },
      usage: { inputTokens, outputTokens },
      model: this.model,
      provider: this.name,
    };
  }
}
