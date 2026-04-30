import Anthropic from "@anthropic-ai/sdk";
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

export interface AnthropicProviderConfig extends BaseProviderConfig {
  kind: "anthropic";
  enablePromptCache?: boolean;
}

export class AnthropicProvider implements ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    maxContextTokens: 200_000,
    promptCaching: true,
  };
  private client: Anthropic;
  private cfg: AnthropicProviderConfig;

  constructor(cfg: AnthropicProviderConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.model = cfg.model;
    if (!cfg.apiKey) throw new ProviderError("Missing Anthropic API key", cfg.name);
    this.client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async review(input: ReviewInput, _opts?: ReviewOptions): Promise<ProviderResponse> {
    const schema = toJsonSchema();
    const tool = {
      name: "submit_review",
      description: "Submit the structured code review.",
      input_schema: schema as Anthropic.Tool.InputSchema,
    };

    const useCache = this.cfg.enablePromptCache !== false;
    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: input.systemPrompt,
        ...(useCache ? { cache_control: { type: "ephemeral" } } : {}),
      },
    ];

    const result = await withRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: input.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 2000,
        temperature: this.cfg.temperature ?? 0.2,
        system: systemBlocks,
        tools: [tool],
        tool_choice: { type: "tool", name: "submit_review" },
        messages: [{ role: "user", content: input.userPrompt }],
      }),
    );

    const toolUse = result.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    if (!toolUse) throw new ProviderError("Anthropic response missing tool_use", this.name);

    let parsed;
    try {
      parsed = ReviewResponseSchema.parse(toolUse.input);
    } catch (err) {
      logger.error({ err, input: toolUse.input }, "Failed to parse Anthropic response");
      throw new ProviderError("Invalid response shape from Anthropic", this.name, err);
    }

    const usage = result.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const cachedInputTokens =
      (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

    return {
      result: { changes: parsed.changes.map(normalizeFinding), summary: parsed.summary },
      usage: { inputTokens, outputTokens, cachedInputTokens },
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
