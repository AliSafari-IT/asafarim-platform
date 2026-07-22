/**
 * Redaction layer for anything derived from provider calls or user prompts
 * that might reach logs/diagnostics. Applied at the boundary where
 * generation-pipeline code is about to `console.log`/persist a diagnostic
 * string — never trust a value has already been redacted upstream.
 *
 * This is deliberately conservative (pattern-based, not an exhaustive
 * secret scanner) — see docs/appbuilder-m07-ai-generation.md "Prompt and
 * log safety" for what M12 is expected to harden further.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style API keys
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic-style API keys
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi, // Authorization headers
  /postgres(?:ql)?:\/\/[^\s"']+/gi, // database connection strings
  /redis:\/\/[^\s"']+/gi, // redis connection strings
  /"?(?:api[_-]?key|authorization|cookie|session[_-]?token|password|secret)"?\s*[:=]\s*"?[^\s"',}]+/gi,
];

const REDACTED = "[REDACTED]";

/** Redacts known secret shapes from a single string. Safe on already-clean strings (no-op). */
export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

const NEVER_LOG_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "cookies",
  "password",
  "secret",
  "sessiontoken",
  "session_token",
  "token",
  "databaseurl",
  "database_url",
]);

/**
 * Deep-redacts an object before it's logged or persisted as diagnostics.
 * Drops values for keys on the denylist outright (rather than pattern-
 * matching their value, since a secret's shape can vary) and pattern-
 * redacts every string value it does keep. Bounded recursion depth guards
 * against pathological/cyclic input from a provider response.
 */
export function redactForLogging(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactForLogging(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (NEVER_LOG_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""))) {
        result[key] = REDACTED;
      } else {
        result[key] = redactForLogging(val, depth + 1);
      }
    }
    return result;
  }
  return value;
}

/**
 * Produces a safe summary object for persistence on the job row / audit
 * log: only the fields the product actually needs (see the M07 "Prompt and
 * log safety" contract), each pattern-redacted. Callers pass exactly the
 * fields they intend to persist — this function does not decide retention,
 * only safety of what's already been decided to keep.
 */
export function buildSafeSummary(fields: Record<string, unknown>): Record<string, unknown> {
  return redactForLogging(fields) as Record<string, unknown>;
}
