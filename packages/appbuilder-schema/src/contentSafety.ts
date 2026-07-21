/**
 * Heuristic denylist for free-text fields (descriptions, labels, summaries).
 * This is NOT a general-purpose sanitizer — it is a defense-in-depth net
 * that keeps obviously adversarial payloads (script tags, inline event
 * handlers, SQL injection shapes, shell/package-manager invocations, env
 * var interpolation) out of a specification a future AI planner (M07)
 * or the metadata-driven runtime (M06) might otherwise render/interpret
 * unsafely. Legitimate business copy should never trip this.
 */
const DENYLIST_PATTERNS: RegExp[] = [
  /<script\b/i,
  /<iframe\b/i,
  /on\w+\s*=\s*["']/i, // inline event handlers: onclick="...", onerror='...'
  /javascript:/i,
  /\bDROP\s+TABLE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bINSERT\s+INTO\b/i,
  /--\s*$/, // trailing SQL comment used to truncate a query
  /;\s*--/,
  /\bUNION\s+SELECT\b/i,
  /\$\{.*\}/, // template/env interpolation
  /\bnpm\s+install\b/i,
  /\bpip\s+install\b/i,
  /\brm\s+-rf\b/i,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
];

export interface ContentSafetyViolation {
  pattern: string;
  match: string;
}

/** Returns every denylisted match found in `value`, or an empty array if none. */
export function scanForUnsafeContent(value: string): ContentSafetyViolation[] {
  const violations: ContentSafetyViolation[] = [];
  for (const pattern of DENYLIST_PATTERNS) {
    const match = value.match(pattern);
    if (match) {
      violations.push({ pattern: pattern.source, match: match[0] });
    }
  }
  return violations;
}

export function isContentSafe(value: string): boolean {
  return scanForUnsafeContent(value).length === 0;
}
