/**
 * Best-effort secret/PII redaction applied to any source content or model
 * output before it is logged, audited, or included in an error message.
 * Not a security boundary on its own — schema validation is what stops
 * unsafe output from reaching persistence — but it keeps obvious secrets
 * (API keys, emails, bearer tokens) out of the audit trail.
 */

const PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style API keys
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // emails
  /Bearer\s+[A-Za-z0-9._-]+/gi, // bearer tokens
  /\b(?:\d[ -]*?){13,19}\b/g, // card-number-shaped digit runs
];

export function redact(text: string): string {
  return PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[redacted]"), text);
}

/** Truncates and redacts free text before it's ever written to the audit trail (never raw prompts, per spec). */
export function redactForAudit(text: string, maxLength = 200): string {
  const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  return redact(truncated);
}
