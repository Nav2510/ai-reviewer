import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { ProviderResponse, ReviewInput, ReviewOptions } from "../core/types.js";
import { ReviewResponseSchema, normalizeFinding } from "../core/schema.js";
import { withRetry } from "../core/retry.js";
import { logger } from "../core/logger.js";
import {
  type BaseProviderConfig,
  type ModelProvider,
  type ProviderCapabilities,
  ProviderError,
} from "./base.js";

export interface GeminiProviderConfig extends BaseProviderConfig {
  kind: "gemini";
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    changes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          line: { type: SchemaType.NUMBER },
          original_code: { type: SchemaType.STRING },
          suggested_change: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          document: { type: SchemaType.STRING, nullable: true },
          type: { type: SchemaType.STRING, enum: ["issue", "suggestion", "document"] },
          severity: {
            type: SchemaType.STRING,
            enum: ["info", "suggestion", "issue", "critical"],
          },
          rule_id: { type: SchemaType.STRING, nullable: true },
        },
        required: [
          "line",
          "original_code",
          "suggested_change",
          "explanation",
          "type",
          "severity",
        ],
      },
    },
    summary: { type: SchemaType.STRING },
  },
  required: ["changes", "summary"],
};

export class GeminiProvider implements ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    supportsStructuredOutput: true,
    supportsStreaming: true,
    maxContextTokens: 1_000_000,
    promptCaching: false,
  };
  private client: GoogleGenerativeAI;
  private cfg: GeminiProviderConfig;

  constructor(cfg: GeminiProviderConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.model = cfg.model;
    if (!cfg.apiKey) throw new ProviderError("Missing Gemini API key", cfg.name);
    this.client = new GoogleGenerativeAI(cfg.apiKey);
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async review(input: ReviewInput, _opts?: ReviewOptions): Promise<ProviderResponse> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: input.systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as never,
        maxOutputTokens: input.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 2000,
        temperature: this.cfg.temperature ?? 0.2,
      },
    });

    const result = await withRetry(() => model.generateContent(input.userPrompt));
    const text = result.response.text();
    if (!text) throw new ProviderError("Empty response from Gemini", this.name);

    let parsed;
    try {
      parsed = ReviewResponseSchema.parse(JSON.parse(text));
    } catch (err) {
      logger.error({ err, text }, "Failed to parse Gemini response");
      throw new ProviderError("Invalid response shape from Gemini", this.name, err);
    }

    const usage = result.response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? this.countTokens(input.userPrompt);
    const outputTokens = usage?.candidatesTokenCount ?? this.countTokens(text);
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
