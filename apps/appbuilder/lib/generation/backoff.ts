/**
 * Exponential backoff with full jitter (AWS-style: a random delay uniformly
 * chosen between 0 and the exponential cap, not just an additive jitter) —
 * avoids synchronized retry storms when many jobs fail around the same
 * time (e.g. a provider-wide outage).
 */
export function computeBackoffDelayMs(attempt: number, options?: { baseMs?: number; maxMs?: number }): number {
  const baseMs = options?.baseMs ?? 2_000;
  const maxMs = options?.maxMs ?? 60_000;
  const cap = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * cap);
}
