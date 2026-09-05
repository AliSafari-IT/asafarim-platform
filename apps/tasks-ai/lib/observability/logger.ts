import pino from "pino";

/**
 * Structured, redacted logger shared by the web app and the worker.
 *
 * Redaction is defence in depth against a secret reaching a log aggregator:
 * anything that looks like a connection string, token, or authorization
 * header is replaced with `[redacted]` regardless of nesting.
 */
const REDACT_PATHS = [
  "*.password",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.databaseUrl",
  "*.redisUrl",
  "req.headers.authorization",
  "req.headers.cookie",
  "DATABASE_URL",
  "TASKSAI_DATABASE_URL",
  "TASKSAI_REDIS_URL",
  "AUTH_SECRET",
];

const DSN_LIKE = /\b\w+:\/\/[^\s"']*:[^\s"']*@[^\s"']+/g;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "tasks-ai" },
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  formatters: {
    level: (label) => ({ level: label }),
  },
  hooks: {
    logMethod(args, method) {
      const scrubbed = args.map((arg) =>
        typeof arg === "string" ? arg.replace(DSN_LIKE, "[redacted-dsn]") : arg,
      );
      return method.apply(this, scrubbed as typeof args);
    },
  },
});

/** Redact DSN-like substrings from an arbitrary string (exported for tests). */
export function scrubDsn(value: string): string {
  return value.replace(DSN_LIKE, "[redacted-dsn]");
}

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
