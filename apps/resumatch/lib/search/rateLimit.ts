/**
 * Search rate limiting (JM-037).
 *
 * Search is the one authenticated surface that returns bulk data about
 * third-party content — job postings — rather than about the candidate
 * themselves, which makes it the natural target for scraping JobMatch's own
 * ingestion work back out through a signed-in account. This is a sliding
 * window per workspace, held in memory.
 *
 * The in-memory choice is a stated limitation, not an oversight: it resets
 * on deploy and does not share state across instances, so it slows down a
 * script rather than stopping a determined one across a fleet. JobMatch
 * runs as a single instance today, which is what makes that acceptable
 * short of standing up Redis for a limiter with nothing yet to protect —
 * there are no postings to scrape until a source is authorised. Revisit
 * before that changes.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

const hits = new Map<string, number[]>();

/** Bound memory growth: dropped periodically rather than on every request. */
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, timestamps] of hits) {
    const kept = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Record one request for `key` and report whether it is within the limit. */
export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  maxRequests: number = MAX_REQUESTS_PER_WINDOW,
): RateLimitResult {
  cleanup(now);

  const timestamps = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (timestamps.length >= maxRequests) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    hits.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true, remaining: maxRequests - timestamps.length, retryAfterSeconds: 0 };
}

/** Test-only: drop all recorded state. */
export function resetRateLimitState(): void {
  hits.clear();
  lastCleanup = Date.now();
}
