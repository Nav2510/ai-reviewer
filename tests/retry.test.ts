import { describe, expect, it } from "vitest";
import { withRetry } from "../src/core/retry.js";

describe("retry", () => {
  it("returns immediately on success", async () => {
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toBe(1);
  });

  it("retries on retryable error then succeeds", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const e: any = new Error("rate limit hit");
          e.status = 429;
          throw e;
        }
        return "ok";
      },
      { minDelayMs: 1, maxDelayMs: 5, retries: 5 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          const e: any = new Error("invalid");
          e.status = 400;
          throw e;
        },
        { minDelayMs: 1, retries: 3 },
      ),
    ).rejects.toThrow("invalid");
    expect(calls).toBe(1);
  });

  it("gives up after retries exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          const e: any = new Error("server error");
          e.status = 500;
          throw e;
        },
        { minDelayMs: 1, maxDelayMs: 2, retries: 2 },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(3);
  });
});
