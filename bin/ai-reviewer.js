#!/usr/bin/env node
import { runCli } from "../dist/runners/cli.js";

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
