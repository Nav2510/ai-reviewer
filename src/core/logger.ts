import pino from "pino";

const isActionsDebug =
  process.env.RUNNER_DEBUG === "1" || process.env.ACTIONS_STEP_DEBUG === "true";

const explicitLevel = process.env.AIREVIEWER_LOG_LEVEL;
const level =
  explicitLevel ?? (isActionsDebug ? "debug" : process.env.CI ? "info" : "debug");

export const logger = pino({
  level,
  base: { pkg: "ai-reviewer" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
