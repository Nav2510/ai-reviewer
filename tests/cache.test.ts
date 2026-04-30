import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileCache, InMemoryCache, NullCache, hashKey } from "../src/core/cache.js";

describe("cache", () => {
  it("hashKey is deterministic", () => {
    expect(hashKey(["a", 1])).toBe(hashKey(["a", 1]));
    expect(hashKey(["a", 1])).not.toBe(hashKey(["a", 2]));
  });

  it("InMemoryCache get/set roundtrip", async () => {
    const c = new InMemoryCache<{ v: number }>();
    await c.set("k", { v: 42 });
    expect(await c.get("k")).toEqual({ v: 42 });
    expect(await c.get("missing")).toBeUndefined();
  });

  it("NullCache always misses", async () => {
    const c = new NullCache<unknown>();
    await c.set("k", { v: 1 });
    expect(await c.get("k")).toBeUndefined();
  });

  describe("FileCache", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "aireviewer-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    it("persists across instances", async () => {
      const a = new FileCache<{ v: number }>(dir);
      await a.set("k", { v: 7 });
      const b = new FileCache<{ v: number }>(dir);
      expect(await b.get("k")).toEqual({ v: 7 });
    });
  });
});
