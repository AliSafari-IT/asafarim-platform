import { redact } from "./redact";

/**
 * Structured JSON logging for JobMatch (JM-015).
 *
 * One line per event, machine-parseable, and redacted by construction:
 * callers cannot pass a payload through this module without it going
 * through `redact()` first, so "we forgot to strip the CV text" is not an
 * available failure mode.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  service: "jobmatch";
  event: string;
  timestamp: string;
  context: Record<string, unknown>;
}

export function buildLogEvent(
  level: LogLevel,
  event: string,
  context: unknown = {},
  now: Date = new Date(),
): LogEvent {
  return {
    level,
    service: "jobmatch",
    event,
    timestamp: now.toISOString(),
    context: redact(context),
  };
}

function emit(level: LogLevel, event: string, context?: unknown): void {
  const line = JSON.stringify(buildLogEvent(level, event, context));
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, context?: unknown) => emit("debug", event, context),
  info: (event: string, context?: unknown) => emit("info", event, context),
  warn: (event: string, context?: unknown) => emit("warn", event, context),
  error: (event: string, context?: unknown) => emit("error", event, context),
};

/**
 * Log a caught error without ever logging its message. Error messages from
 * a database driver or an HTTP client routinely embed connection strings
 * and request bodies; the class name plus the call site is what an operator
 * actually needs, and the rest is a leak waiting to happen.
 */
export function logError(event: string, error: unknown, context: Record<string, unknown> = {}): void {
  log.error(event, {
    ...context,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}
