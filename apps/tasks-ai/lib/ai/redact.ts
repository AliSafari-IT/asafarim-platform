/**
 * PII / secret redaction for AI prompts (docs: M06 "least-data prompts,
 * PII/secret redaction"). Runs on every input before it leaves the process
 * for a provider. Pure and dependency-free so it is unit-tested exhaustively.
 *
 * Conservative by design: it over-redacts rather than risk a token or an
 * email reaching a provider. The redacted text keeps enough shape
 * (`[EMAIL]`, `[SECRET]`) that the model can still reason about structure.
 */
const RULES: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],
  [/\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9\-_]{12,}\b/g, "[SECRET]"],
  [/\b[A-Za-z0-9_-]{2,}:\/\/[^\s"'@]+:[^\s"'@]+@[^\s"']+/g, "[DSN]"],
  [/\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi, "Bearer [SECRET]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, "[JWT]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[CARD]"],
  [/\b\+?\d[\d\s().-]{7,}\d\b/g, "[PHONE]"],
  [/\b[0-9a-fA-F]{32,}\b/g, "[HEX]"],
];

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
}

export function redact(input: string): RedactionResult {
  let text = input;
  const counts: Record<string, number> = {};
  for (const [re, token] of RULES) {
    text = text.replace(re, () => {
      counts[token] = (counts[token] ?? 0) + 1;
      return token;
    });
  }
  return { text, counts };
}

/** True when the input still appears to contain a secret after redaction. */
export function looksSensitive(text: string): boolean {
  return /\b(password|api[_-]?key|secret|token)\b\s*[:=]\s*\S+/i.test(text);
}
