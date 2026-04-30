import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { ReviewEngine } from "../core/engine.js";
import { buildFileChange } from "../core/diff.js";
import { logger } from "../core/logger.js";
import { loadConfig, findConfigFile } from "../config/loader.js";
import { buildRegistry, buildCache, buildReporters } from "./setup.js";

interface CliArgs {
  command: "review" | "init" | "doctor";
  base?: string;
  head?: string;
  pr?: number;
  configPath?: string;
  json?: string;
  owner?: string;
  repo?: string;
  dryRun?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const command = (argv[2] ?? "review") as CliArgs["command"];
  const args: CliArgs = { command };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--base") args.base = next();
    else if (a === "--head") args.head = next();
    else if (a === "--pr") args.pr = Number(next());
    else if (a === "--config") args.configPath = next();
    else if (a === "--json") args.json = next();
    else if (a === "--owner") args.owner = next();
    else if (a === "--repo") args.repo = next();
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function localDiffFiles(base: string, head: string) {
  const out = execSync(`git diff --name-status ${base}...${head}`, { encoding: "utf8" });
  const files: { filename: string; status: string; patch: string }[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [statusRaw, ...rest] = line.split("\t");
    const filename = rest[rest.length - 1];
    if (!statusRaw || !filename) continue;
    const status =
      statusRaw.startsWith("A") ? "added" :
      statusRaw.startsWith("D") ? "removed" :
      statusRaw.startsWith("R") ? "renamed" : "modified";
    let patch = "";
    try {
      patch = execSync(`git diff ${base}...${head} -- "${filename}"`, { encoding: "utf8" });
    } catch {
      patch = "";
    }
    files.push({ filename, status, patch });
  }
  return files;
}

async function runReview(args: CliArgs): Promise<void> {
  const cfg = loadConfig(args.configPath);
  if (args.json) {
    cfg.reporters = [{ kind: "json", path: args.json }, { kind: "stdout" }];
  } else if (!process.env.GITHUB_TOKEN) {
    cfg.reporters = [{ kind: "stdout" }];
  }

  const registry = buildRegistry(cfg);
  const cache = buildCache(cfg);

  let files;
  let ghCtx;

  if (args.pr && args.owner && args.repo) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("--pr mode requires GITHUB_TOKEN");
    const octokit = new Octokit({ auth: token });
    const data = await octokit.paginate(octokit.pulls.listFiles, {
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pr,
      per_page: 100,
    });
    files = data.map((f) =>
      buildFileChange({ filename: f.filename, status: f.status, patch: f.patch }),
    );
    const { data: commits } = await octokit.pulls.listCommits({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pr,
    });
    ghCtx = {
      token,
      owner: args.owner,
      repo: args.repo,
      pullNumber: args.pr,
      commitId: commits[commits.length - 1]!.sha,
    };
  } else {
    const base = args.base ?? "origin/main";
    const head = args.head ?? "HEAD";
    files = localDiffFiles(base, head).map((f) =>
      buildFileChange({ filename: f.filename, status: f.status, patch: f.patch }),
    );
  }

  if (args.dryRun) {
    logger.info({ count: files.length }, "Dry-run: files that would be reviewed");
    for (const f of files) process.stdout.write(`${f.status} ${f.path} (${f.hunks.length} hunks)\n`);
    return;
  }

  const reporters = buildReporters(cfg, ghCtx);
  const engine = new ReviewEngine({ config: cfg, registry, reporters, cache });
  await engine.run({ files });
}

async function runInit(): Promise<void> {
  const target = ".aireviewerrc.yml";
  if (fs.existsSync(target)) {
    logger.warn({ target }, "config already exists; not overwriting");
    return;
  }
  const sample = `# .aireviewerrc.yml
providers:
  - name: openai
    kind: openai
    model: gpt-4o-mini
    apiKeyEnv: OPENAI_API_KEY
  # - name: anthropic
  #   kind: anthropic
  #   model: claude-sonnet-4-6
  #   apiKeyEnv: ANTHROPIC_API_KEY

defaultProvider: openai
# fallback: [anthropic]
# routes:
#   - { match: "**/*.sql", provider: openai }

review:
  include: ["**/src/**/*.{ts,tsx,js,jsx}"]
  exclude: ["**/*.test.*", "dist/**", "node_modules/**"]
  mode: diff
  minSeverity: suggestion
  maxCommentsPerFile: 8
  cache: file
  concurrency: 4

reporters:
  - kind: github
`;
  await fs.promises.writeFile(target, sample, "utf8");
  logger.info({ target }, "wrote default config");
}

async function runDoctor(args: CliArgs): Promise<void> {
  const file = args.configPath ?? findConfigFile();
  process.stdout.write(`Config file: ${file ?? "(none, env-inferred)"}\n`);
  const cfg = loadConfig(file);
  process.stdout.write(`Providers: ${cfg.providers.map((p) => `${p.name}(${p.kind}/${p.model})`).join(", ")}\n`);
  for (const p of cfg.providers) {
    const ok = !!(p.apiKey ?? (p.apiKeyEnv && process.env[p.apiKeyEnv]));
    process.stdout.write(`  ${ok ? "✓" : "✗"} ${p.name}: api key ${ok ? "present" : "MISSING"}\n`);
  }
  process.stdout.write(`Reporters: ${cfg.reporters.map((r) => r.kind).join(", ")}\n`);
  process.stdout.write(`Cache: ${cfg.review.cache} (${cfg.review.cacheDir})\n`);
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "review":
      await runReview(args);
      break;
    case "init":
      await runInit();
      break;
    case "doctor":
      await runDoctor(args);
      break;
    default:
      process.stdout.write(
        "Usage: aireviewer <review|init|doctor> [--base <ref>] [--head <ref>] [--pr <num> --owner <o> --repo <r>] [--config <path>] [--json <path>] [--dry-run]\n",
      );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    logger.error({ err }, "CLI failed");
    process.exit(1);
  });
}
