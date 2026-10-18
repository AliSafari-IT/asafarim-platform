/**
 * PII / secret redaction for the AI tutor (issue #541).
 *
 * Every piece of student text (the inquiry description plus any voice
 * transcript) passes through `redactForProvider` before moderation and
 * before it reaches OpenAI or Anthropic. Many EduMatch students are minors,
 * so an email address or phone number typed into a homework question must
 * never leave the process in raw form. The stored inquiry is untouched; only
 * the outbound copy is redacted.
 *
 * The rule set is adapted from `apps/tasks-ai/lib/ai/redact.ts`. Two rules
 * are narrower here because homework is full of numbers:
 * - `[CARD]` also needs a valid Luhn checksum, so a long number in a maths
 *   question is left alone unless it could really be a card.
 * - `[PHONE]` needs 9–15 digits. An unbroken digit run counts only when it
 *   starts with `+` or `0` (how phone numbers are written in the countries
 *   EduMatch serves). Decimals (`3.14159265`) and runs of single digits
 *   (`1 0 0 0 1 0 0 0 1`, a matrix) are never phones.
 *
 * Pure and dependency-free. The citation-span mapping from tasks-ai is not
 * copied: the tutor does not cite spans of the input.
 */

type Replacer = string | ((match: string) => string);

const PHONE = "[PHONE]";
const CARD = "[CARD]";

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function cardOrKeep(match: string): string {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return match;
  return luhnValid(digits) ? CARD : match;
}

/** Splits a match at the given separators, keeping them, and rechecks each part. */
function recheckParts(match: string, separator: RegExp): string | null {
  const parts = match.split(separator);
  if (parts.length < 2) return null;
  return parts.map((p, i) => (i % 2 === 1 ? p : phoneOrKeep(p))).join("");
}

function phoneOrKeep(match: string): string {
  const digits = match.replace(/\D/g, "");
  if (digits.length > 15) {
    // Too long for one phone number: usually two numbers the greedy pattern
    // joined ("0470 12 34 56 / 02 123 45 67"). Split at clear boundaries
    // (slash, line break, a run of spaces), then before each group that
    // starts like a phone number (`+`, or a trunk `0` followed by 1–9), and
    // check each part again. Never let such a match through unchecked.
    return (
      recheckParts(match, /(\s*\/\s*|\s*\n\s*|\s{2,})/) ??
      recheckParts(match, /(\s+)(?=\+|\(?0[1-9])/) ??
      // Still one unsplittable run: fail closed if it starts like a phone.
      (/^(?:\+|\(?0)/.test(match) ? PHONE : match)
    );
  }
  if (digits.length < 9) return match;
  // A plain decimal number, e.g. 3.14159265 or 1234.56789.
  if (/^\d+\.\d+$/.test(match)) return match;
  const groups = match.split(/[^\d]+/).filter((g) => g.length > 0);
  if (groups.length === 1) {
    // No separators: only a phone when written with a country or trunk prefix.
    return /^(?:\+|0)/.test(match) ? PHONE : match;
  }
  // Every group a single digit: a matrix, a sequence or spaced-out digits.
  if (groups.every((g) => g.length === 1)) return match;
  return PHONE;
}

const RULES: [RegExp, Replacer, string][] = [
  // DSN before EMAIL, so `user:pass@host` is replaced whole.
  [/\b[A-Za-z0-9_-]{2,}:\/\/[^\s"'@]+:[^\s"'@]+@[^\s"']+/g, "[DSN]", "[DSN]"],
  // Bounded lengths (RFC 5321 limits) keep this linear on long text with
  // many word boundaries and no `@`; unbounded, it was quadratic.
  [
    /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}\b/g,
    "[EMAIL]",
    "[EMAIL]",
  ],
  [
    /\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9\-_]{12,}\b/g,
    "[SECRET]",
    "[SECRET]",
  ],
  [/\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi, "Bearer [SECRET]", "Bearer [SECRET]"],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g,
    "[JWT]",
    "[JWT]",
  ],
  [/\b(?:\d[ -]?){12,18}\d\b/g, cardOrKeep, CARD],
  [/(?<![\w.])\+?\(?\d[\d\s()./-]{7,}\d\b(?!\.\d)/g, phoneOrKeep, PHONE],
  [/\b[0-9a-fA-F]{32,}\b/g, "[HEX]", "[HEX]"],
];

export interface RedactionResult {
  /** The text that may be sent to a provider. */
  text: string;
  /** How many replacements each token got, e.g. `{ "[EMAIL]": 1 }`. */
  counts: Record<string, number>;
}

export function redactForProvider(input: string): RedactionResult {
  let text = input;
  const counts: Record<string, number> = {};
  for (const [re, replacer, token] of RULES) {
    re.lastIndex = 0;
    text = text.replace(re, (match) => {
      const out = typeof replacer === "string" ? replacer : replacer(match);
      if (out !== match) {
        // A split phone match can hold several tokens.
        const n = Math.max(1, out.split(token).length - 1);
        counts[token] = (counts[token] ?? 0) + n;
      }
      return out;
    });
  }
  return { text, counts };
}
