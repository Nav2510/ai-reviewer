import type { Reporter, ReviewReport } from "./base.js";

export class StdoutReporter implements Reporter {
  readonly name = "stdout";
  async publish(report: ReviewReport): Promise<void> {
    for (const f of report.files) {
      process.stdout.write(`\n=== ${f.path} (${f.provider}/${f.model}) ===\n`);
      process.stdout.write(`${f.summary}\n`);
      for (const finding of f.findings) {
        process.stdout.write(
          `  L${finding.line} [${finding.severity}/${finding.type}] ${finding.explanation}\n`,
        );
      }
    }
    const cost = report.totalCostUsd ? `$${report.totalCostUsd.toFixed(4)}` : "n/a";
    process.stdout.write(
      `\nTotal — files: ${report.files.length}, cost: ${cost}, tokens in/out: ${report.totalInputTokens}/${report.totalOutputTokens}\n`,
    );
  }
}
