/**
 * Per-target run rate limit (#703): at most N runs per target per rolling hour,
 * so Testora can't be used to hammer a site. Durable since #716 — counted from
 * the `runs` table (runStore.recentRunTimes), so a restart doesn't reset it.
 */

export const DEFAULT_RUNS_PER_TARGET_PER_HOUR = 30;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Given when this target's recent runs were created (ms, oldest first), may
 * another start now? If not, how long until the oldest leaves the window.
 */
export function rateLimitDecision(
  recentStarts: number[],
  limit: number,
  now: number = Date.now(),
  windowMs: number = RATE_WINDOW_MS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = recentStarts.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (recent.length < limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) };
}

/** The configured limit (TESTORA_RUNS_PER_TARGET_PER_HOUR, default 30). */
export function runsPerTargetPerHour(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.TESTORA_RUNS_PER_TARGET_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_RUNS_PER_TARGET_PER_HOUR;
}

/** The rate-limit key: the stored target, else the origin the run points at. */
export function rateLimitKey(targetId: string | undefined, url: string | undefined): string {
  if (targetId) return `target:${targetId}`;
  try {
    return `origin:${new URL(url ?? "").origin}`;
  } catch {
    return "origin:unknown";
  }
}
