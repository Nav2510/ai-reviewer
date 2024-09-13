import { logger } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

const defaultRetryable = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status && (e.status === 408 || e.status === 429 || e.status >= 500)) return true;
  if (e.code && ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(e.code)) return true;
  if (e.message && /rate.?limit|temporar|timeout|overload/i.test(e.message)) return true;
  return false;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const minDelay = opts.minDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 30_000;
  const factor = opts.factor ?? 2;
  const isRetryable = opts.isRetryable ?? defaultRetryable;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isRetryable(err)) throw err;
      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(maxDelay, minDelay * Math.pow(factor, attempt - 1)) * jitter;
      logger.warn(
        { attempt, delayMs: Math.round(delay), err: (err as Error)?.message },
        "Retrying after error",
      );
      opts.onRetry?.(err, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
