import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";

describe("config loader", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-cfg-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.OPENAI_API_KEY;
  });

  it("loads yaml and applies defaults", () => {
    const file = path.join(dir, ".ai-reviewerrc.yml");
    fs.writeFileSync(
      file,
      `providers:
  - name: openai
    kind: openai
    model: gpt-4o-mini
    apiKey: sk-test
`,
    );
    const cfg = loadConfig(file);
    expect(cfg.providers).toHaveLength(1);
    expect(cfg.review.mode).toBe("diff");
    expect(cfg.review.minSeverity).toBe("suggestion");
  });

  it("substitutes apiKeyEnv", () => {
    process.env.OPENAI_API_KEY = "sk-from-env";
    const file = path.join(dir, ".ai-reviewerrc.yml");
    fs.writeFileSync(
      file,
      `providers:
  - name: openai
    kind: openai
    model: gpt-4o-mini
    apiKeyEnv: OPENAI_API_KEY
`,
    );
    const cfg = loadConfig(file);
    expect(cfg.providers[0]!.apiKey).toBe("sk-from-env");
  });

  it("infers config from env vars when no file", () => {
    process.env.OPENAI_API_KEY = "sk-x";
    const cfg = loadConfig(undefined, dir);
    expect(cfg.providers[0]!.kind).toBe("openai");
  });

  it("applies preset extends", () => {
    const file = path.join(dir, ".ai-reviewerrc.yml");
    fs.writeFileSync(
      file,
      `extends:
  - preset:react
providers:
  - name: openai
    kind: openai
    model: gpt-4o-mini
    apiKey: sk-test
`,
    );
    const cfg = loadConfig(file);
    expect(cfg.rules.some((r) => r.id === "react-key-prop")).toBe(true);
  });
});
