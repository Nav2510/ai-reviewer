# AI Reviewer

Provider-agnostic, diff-aware AI code reviewer for pull requests. Drops a single GitHub Action into your repo and posts batched, line-level review comments backed by the LLM of your choice (OpenAI, Anthropic, Gemini, or a local Ollama model).

- **Diff-only by default** — reviews changed hunks, not whole files. Cheap and fast.
- **Multi-provider** — OpenAI / Anthropic / Gemini / Ollama. Per-file routing + fallback chain.
- **Plug-and-play** — one YAML config, zero code changes to extend.
- **Cached** — repeat runs on the same SHA are free.
- **Batched** — one PR review per run, not N comments × M API calls.

## Quick start (recommended: composite Action)

`.github/workflows/review.yml`:

```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: ai-reviewer/action@v2
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          # anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # gemini-api-key:    ${{ secrets.GEMINI_API_KEY }}
```

That's it. With no config file, the runner infers a sensible default from whichever API key is present.

## Configuration

Drop `.ai-reviewerrc.yml` in your repo root for full control:

```yaml
extends:
  - preset:react

providers:
  - name: anthropic
    kind: anthropic
    model: claude-sonnet-4-6
    apiKeyEnv: ANTHROPIC_API_KEY
  - name: openai
    kind: openai
    model: gpt-4o-mini
    apiKeyEnv: OPENAI_API_KEY

defaultProvider: anthropic
fallback: [openai]

routes:
  - { match: "**/*.sql", provider: openai }

review:
  include: ["**/src/**/*.{ts,tsx,js,jsx}"]
  exclude: ["**/*.test.*", "dist/**"]
  mode: diff # diff | full-file | hybrid
  minSeverity: suggestion
  maxCommentsPerFile: 8
  maxCostUsd: 1.00
  skipLabels: [no-ai-review, wip]
  cache: file
  concurrency: 4

rules:
  - id: no-console-log
    severity: issue
    description: Disallow console.log in committed source.

prompts:
  systemAddendum: |
    Our team strongly prefers functional patterns over class hierarchies.

reporters:
  - kind: github
    publishSummaryComment: true
    updatePrDescription: false
```

Built-in presets: `preset:react`, `preset:node`, `preset:python`, `preset:go`. Local files also work in `extends:` (e.g. `./.ai-reviewer/team-rules.yml`).

## How to use

### 1. Review every pull request automatically (recommended)

Use the composite GitHub Action shown in [Quick start](#quick-start-recommended-composite-action). Every `opened` / `synchronize` / `reopened` event triggers a fresh review. Findings are posted as a single batched PR review (one API call, not one per comment).

Required GitHub Secrets:

| Secret              | When                     |
| ------------------- | ------------------------ |
| `OPENAI_API_KEY`    | Using OpenAI provider    |
| `ANTHROPIC_API_KEY` | Using Anthropic provider |
| `GEMINI_API_KEY`    | Using Gemini provider    |

The Action also needs `pull-requests: write` permission — already set in the Quick-start workflow.

### 2. Run locally before pushing

```bash
npm install -g ai-reviewer            # or use npx ai-reviewer
export OPENAI_API_KEY=sk-...
ai-reviewer review --base origin/main --head HEAD
```

By default with no `GITHUB_TOKEN`, output goes to stdout instead of trying to post comments. Add `--json review.json` to also write structured findings for tooling.

### 3. Review an existing GitHub PR from your machine

```bash
export GITHUB_TOKEN=ghp_...
export OPENAI_API_KEY=sk-...
ai-reviewer review --pr 123 --owner my-org --repo my-repo
```

This fetches the PR's files via the GitHub API and posts a real review — useful for re-reviewing after editing your config.

### 4. Bootstrap config and check it

```bash
ai-reviewer init        # writes a starter .ai-reviewerrc.yml
ai-reviewer doctor      # validates config, lists providers, checks API keys
```

`doctor` prints which providers are configured, whether their API keys are present, and which reporters will run.

### 5. Switch or combine providers

Single provider — change `providers[*].kind` and `model`:

```yaml
providers:
  - name: claude
    kind: anthropic
    model: claude-sonnet-4-6
    apiKeyEnv: ANTHROPIC_API_KEY
defaultProvider: claude
```

Fallback chain (try the next provider if the first errors or rate-limits):

```yaml
providers:
  - { name: claude, kind: anthropic, model: claude-sonnet-4-6, apiKeyEnv: ANTHROPIC_API_KEY }
  - { name: gpt, kind: openai, model: gpt-4o-mini, apiKeyEnv: OPENAI_API_KEY }
defaultProvider: claude
fallback: [gpt]
```

Per-file routing (different model for SQL or migrations):

```yaml
routes:
  - { match: "**/*.sql", provider: gpt }
  - { match: "db/migrations/**/*.{ts,js}", provider: gpt }
  - { match: "**/*", provider: claude }
```

Local LLM (no API key needed; requires Ollama running on the host):

```yaml
providers:
  - name: local
    kind: ollama
    model: qwen2.5-coder:14b
    baseUrl: http://localhost:11434
defaultProvider: local
```

### 6. Add custom rules and a team prompt

```yaml
rules:
  - id: no-console-log
    severity: issue
    description: Disallow console.log in committed source.
    files: ["**/src/**/*.{ts,js}"]
  - id: require-jsdoc
    severity: suggestion
    description: Public exported functions should have JSDoc with @param/@returns.

prompts:
  systemAddendum: |
    Prefer functional patterns over class hierarchies.
    Flag any new dependencies introduced in package.json.
```

Rules are passed into the system prompt for files they apply to. The model attaches `rule_id` to findings, which the clusterer uses to group repeat offenders in the PR summary.

### 7. Skip a review for a specific PR

Add one of the configured `skipLabels` (default: `no-ai-review`, `wip`) to the PR. The Action exits without posting anything.

### 8. Cap cost per PR

```yaml
review:
  maxCostUsd: 0.50 # abort when running cost reaches $0.50
  maxCommentsPerFile: 6 # cap noise
  minSeverity: issue # drop info/suggestion
```

The total cost is included in the summary comment posted on the PR.

### 9. Use the structured JSON output

```bash
ai-reviewer review --base origin/main --head HEAD --json findings.json
jq '.files[] | select(.findings | length > 0) | .path' findings.json
```

The JSON includes every finding plus `costUsd`, token counts per file, recurring-finding clusters, and timestamps — handy for CI gating ("fail if any `critical` finding") or building dashboards.

### 10. Programmatic use as a library

```ts
import { ReviewEngine, loadConfig, buildFileChange } from "ai-reviewer";
import { ProviderRegistry, OpenAIProvider } from "ai-reviewer";
import { StdoutReporter } from "ai-reviewer";
import { FileCache } from "ai-reviewer";

const config = loadConfig();
const registry = new ProviderRegistry().register(
  new OpenAIProvider({
    name: "openai",
    kind: "openai",
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY!,
  }),
  { default: true },
);

const engine = new ReviewEngine({
  config,
  registry,
  reporters: [new StdoutReporter()],
  cache: new FileCache(".ai-reviewer-cache"),
});

const files = [buildFileChange({ filename: "src/x.ts", status: "modified", patch: myPatch })];
const report = await engine.run({ files });
console.log(`Findings: ${report.files.flatMap((f) => f.findings).length}`);
```

### Environment variables (cheat sheet)

| Variable                                                  | Purpose                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `GITHUB_TOKEN`                                            | Required when posting GitHub PR comments.                    |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Provider credentials.                                        |
| `AI_MODEL`                                                | Override default model when no config file is present.       |
| `SRC_FOLDER_PATTERN`                                      | Comma-separated globs (only used when no config file).       |
| `AIREVIEWER_LOG_LEVEL`                                    | `trace`, `debug`, `info` (default), `warn`, `error`. Auto-promotes to `debug` when GitHub Actions debug logging is enabled (`RUNNER_DEBUG=1` / `ACTIONS_STEP_DEBUG=true`). |
| `AIREVIEWER_SKIP_POSTINSTALL`                             | Set to `1` to suppress the legacy postinstall workflow copy. |

## Architecture

```
ReviewEngine
  ├─ DiffParser ──────── changed hunks, language detection
  ├─ Chunker ─────────── token-aware splitting
  ├─ Cache ───────────── content-hash, file-backed
  ├─ ProviderRegistry ── routes + fallback chain
  │     ├─ OpenAIProvider (structured outputs)
  │     ├─ AnthropicProvider (tool-use + prompt cache)
  │     ├─ GeminiProvider (responseSchema)
  │     └─ OllamaProvider (local, format=json-schema)
  ├─ Filter ──────────── severity threshold, max-per-file, diff-only
  ├─ Cluster ─────────── group recurring findings across files
  └─ Reporter[]
        ├─ GitHubReporter (batched createReview)
        ├─ StdoutReporter
        └─ JsonFileReporter
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Migration from v1.x

The `postinstall` install path still works for one major version with a deprecation notice. Migrate to the composite Action when convenient. Set `AIREVIEWER_SKIP_POSTINSTALL=1` to suppress the install-time copy.

## License

ISC
