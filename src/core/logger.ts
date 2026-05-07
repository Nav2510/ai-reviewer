import pino from "pino";

const level = process.env.ai - reviewer_LOG_LEVEL ?? (process.env.CI ? "info" : "debug");

export const logger = pino({
  level,
  base: { pkg: "ai-reviewer" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
