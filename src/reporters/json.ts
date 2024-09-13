import * as fs from "node:fs";
import type { Reporter, ReviewReport } from "./base.js";

export class JsonFileReporter implements Reporter {
  readonly name = "json";
  constructor(private filePath: string) {}
  async publish(report: ReviewReport): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(report, null, 2), "utf8");
  }
}
