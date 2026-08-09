// Nothing a provider produces reaches the client, the audit log or the
// operation-event stream without passing through here first. The rules are
// deliberately blunt: it is better to over-redact an error message than to
// leak a password out of a Postgres connection failure.

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|session|hash|otp|api[-_]?key|credential|connection|dsn|url|uri/i;

/** Postgres/MySQL-style URLs, including the credential pair. */
const CONNECTION_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi;
/** `user:password@host` fragments that appear without a scheme. */
const CREDENTIAL_PAIR_PATTERN = /\b[\w.-]+:[^\s:@/]+@[\w.-]+/g;
/** libpq keyword form, e.g. `password=hunter2 host=db`. */
const KEYWORD_SECRET_PATTERN =
  /\b(password|pgpassword|user|host|hostaddr|dbname|sslcert|sslkey)\s*=\s*\S+/gi;
/** Anything that looks like a long opaque credential. */
const BEARER_PATTERN = /\b(bearer|basic)\s+[\w.\-+/=]{8,}/gi;

/**
 * Redact a free-text string — an error message, a stack line, a log line.
 * Applied on write so redaction cannot be forgotten at render time.
 */
export function redactText(input: string): string {
  return input
    .replace(CONNECTION_URL_PATTERN, "[redacted-url]")
    .replace(CREDENTIAL_PAIR_PATTERN, "[redacted-credential]")
    .replace(KEYWORD_SECRET_PATTERN, (match) => `${match.split("=")[0]}=[redacted]`)
    .replace(BEARER_PATTERN, "[redacted-token]");
}

/** Deep-redact structured metadata by key name, then by value content. */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactValue(val),
      ])
    );
  }
  return value;
}

/**
 * Turn an unknown thrown value into a stable code plus a safe message.
 * Stack traces and SQL text never survive this function — the message is
 * reduced to its first line and then redacted.
 */
export function sanitizeError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split("\n", 1)[0] ?? "";
  const message = redactText(firstLine).slice(0, 400);

  const code = classify(raw);
  return { code, message: message || "The operation failed." };
}

function classify(raw: string): string {
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|connection terminated/i.test(raw)) {
    return "DATABASE_UNREACHABLE";
  }
  if (/password authentication|role .* does not exist|permission denied/i.test(raw)) {
    return "DATABASE_AUTH_FAILED";
  }
  if (/relation .* does not exist|column .* does not exist/i.test(raw)) {
    return "SCHEMA_MISMATCH";
  }
  if (/foreign key|violates .* constraint/i.test(raw)) return "CONSTRAINT_VIOLATION";
  if (/abort|cancell?ed/i.test(raw)) return "CANCELLED";
  if (/timeout|timed out/i.test(raw)) return "TIMEOUT";
  return "UNKNOWN";
}
