/**
 * Redaction for JobMatch log and audit payloads (JM-015).
 *
 * JobMatch handles the two categories of data the platform most needs to
 * keep out of logs: CV content (free text that can contain a name, address,
 * date of birth, health details) and source credentials (connector API keys
 * under agreements that forbid disclosure). Neither is ever useful in a log
 * line, so this module is deny-by-default rather than deny-by-pattern:
 * only allow-listed keys survive, everything else becomes a type marker.
 *
 * Type markers ("[redacted:string]") are kept deliberately: an operator
 * debugging a failed ingestion run needs to know a field was present and
 * what shape it had, without ever seeing its contents.
 */

/** Keys whose values may appear verbatim in logs and audit metadata. */
export const ALLOWED_KEYS = new Set([
  "action",
  "attempt",
  "connector",
  "correlationId",
  "count",
  "durationMs",
  "environment",
  "errorName",
  "jobId",
  "latencyMs",
  "method",
  "ok",
  "outcome",
  "path",
  "reasonCode",
  "service",
  "sourceKey",
  "status",
  "workspaceId",
]);

/** Keys that are never emitted at all, not even as a type marker. */
const FORBIDDEN_KEYS = [
  "cv",
  "resume",
  "document",
  "documenttext",
  "extractedtext",
  "email",
  "name",
  "phone",
  "address",
  "password",
  "secret",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "connectionstring",
  "databaseurl",
];

const MAX_DEPTH = 4;

export type Redacted = Record<string, unknown>;

function isForbidden(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return FORBIDDEN_KEYS.some((forbidden) => normalized.includes(forbidden));
}

function marker(value: unknown): string {
  if (Array.isArray(value)) return `[redacted:array(${value.length})]`;
  return `[redacted:${typeof value}]`;
}

/**
 * Reduce an arbitrary object to something safe to persist or ship to a log
 * sink. Never throws: a logger that can fail is a logger that gets removed
 * from the hot path.
 */
export function redact(input: unknown, depth = 0): Redacted {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { value: marker(input) };
  }

  const output: Redacted = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isForbidden(key)) continue;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      output[key] = depth < MAX_DEPTH ? redact(value, depth + 1) : "[redacted:object]";
      continue;
    }

    if (!ALLOWED_KEYS.has(key)) {
      output[key] = marker(value);
      continue;
    }

    // Allow-listed, but still bounded — a "path" can be attacker-influenced.
    output[key] = typeof value === "string" ? value.slice(0, 256) : value;
  }
  return output;
}
