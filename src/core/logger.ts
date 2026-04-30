import pino from "pino";

const level = process.env.AIREVIEWER_LOG_LEVEL ?? (process.env.CI ? "info" : "debug");

export const logger = pino({
  level,
  base: { pkg: "aireviewer" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
