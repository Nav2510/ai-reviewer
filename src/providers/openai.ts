import OpenAI from "openai";
import type {
  ProviderResponse,
  ReviewInput,
  ReviewOptions,
} from "../core/types.js";
import {
  ReviewResponseSchema,
  normalizeFinding,
  toJsonSchema,
} from "../core/schema.js";
import { withRetry } from "../core/retry.js";
import { logger } from "../core/logger.js";
import {
  type BaseProviderConfig,
  type ModelProvider,
  type ProviderCapabilities,
  ProviderError,
} from "./base.js";

export interface OpenAIProviderConfig extends BaseProviderConfig {
  kind: "openai";
}

export class OpenAIProvider implements ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    maxContextTokens: 128_000,
    promptCaching: true,
  };
  private client: OpenAI;
  private cfg: OpenAIProviderConfig;

  constructor(cfg: OpenAIProviderConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.model = cfg.model;
    if (!cfg.apiKey) throw new ProviderError("Missing OpenAI API key", cfg.name);
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async review(input: ReviewInput, _opts?: ReviewOptions): Promise<ProviderResponse> {
    const schema = toJsonSchema();
    const result = await withRetry(() =>
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: input.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 2000,
        temperature: this.cfg.temperature ?? 0.2,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "review_response", schema, strict: true },
        },
      }),
    );

    const text = result.choices[0]?.message?.content;
    if (!text) throw new ProviderError("Empty response from OpenAI", this.name);

    let parsed;
    try {
      parsed = ReviewResponseSchema.parse(JSON.parse(text));
    } catch (err) {
      logger.error({ err, text }, "Failed to parse OpenAI response");
      throw new ProviderError("Invalid response shape from OpenAI", this.name, err);
    }

    const inputTokens = result.usage?.prompt_tokens ?? this.countTokens(input.userPrompt);
    const outputTokens = result.usage?.completion_tokens ?? this.countTokens(text);
    return {
      result: { changes: parsed.changes.map(normalizeFinding), summary: parsed.summary },
      usage: { inputTokens, outputTokens },
      model: this.model,
      provider: this.name,
      costUsd: this.estimateCost(inputTokens, outputTokens),
    };
  }

  private estimateCost(input: number, output: number): number | undefined {
    if (this.cfg.costPerInputToken == null || this.cfg.costPerOutputToken == null) return undefined;
    return input * this.cfg.costPerInputToken + output * this.cfg.costPerOutputToken;
  }
}
