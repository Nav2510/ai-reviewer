import type { ProviderResponse, ReviewInput, ReviewOptions } from "../core/types.js";

export interface ProviderCapabilities {
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  maxContextTokens: number;
  promptCaching: boolean;
}

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  review(input: ReviewInput, opts?: ReviewOptions): Promise<ProviderResponse>;
  countTokens(text: string): number;
}

export interface BaseProviderConfig {
  name: string;
  kind: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
  temperature?: number;
  costPerInputToken?: number;
  costPerOutputToken?: number;
}

export class ProviderError extends Error {
  public readonly providerName: string;
  public override readonly cause?: unknown;
  constructor(message: string, providerName: string, cause?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.providerName = providerName;
    this.cause = cause;
  }
}
