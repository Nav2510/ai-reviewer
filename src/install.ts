import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function findConsumerRoot(): string | undefined {
  let cur = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(cur, "package.json")) && !cur.includes("node_modules")) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return undefined;
}

export function installWorkflow(): void {
  if (process.env.AIREVIEWER_SKIP_POSTINSTALL === "1") return;
  try {
    const consumer = findConsumerRoot();
    if (!consumer) return;
    const candidates = [
      path.resolve(here, "../src/workflows/review.yml"),
      path.resolve(here, "../../src/workflows/review.yml"),
    ];
    const source = candidates.find((p) => fs.existsSync(p));
    if (!source) return;
    const destDir = path.join(consumer, ".github", "workflows");
    const destPath = path.join(destDir, "review.yml");
    if (fs.existsSync(destPath)) {
      console.log("[aireviewer] .github/workflows/review.yml already exists; not overwriting.");
      console.log(
        "[aireviewer] DEPRECATION: postinstall workflow copy will be removed in v4. Migrate to the composite action: `uses: aireviewer/action@v2`.",
      );
      return;
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(source, destPath);
    console.log("[aireviewer] installed .github/workflows/review.yml");
    console.log(
      "[aireviewer] DEPRECATION: postinstall workflow copy will be removed in v4. Prefer the composite action: `uses: aireviewer/action@v2`.",
    );
  } catch (err) {
    console.log("[aireviewer] postinstall skipped:", (err as Error)?.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) installWorkflow();
