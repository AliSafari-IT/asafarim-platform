/**
 * Per-target run rate limit (#703): at most N runs per target per rolling hour,
 * so Testora can't be used to hammer a site. In memory, like the run log
 * itself (single VPS process — see the remote-targets review, F6).
 */

export const DEFAULT_RUNS_PER_TARGET_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;

export class RunRateLimiter {
  private readonly starts = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = WINDOW_MS,
  ) {}

  /** Record a run for `key` if under the limit; otherwise say when to retry. */
  tryAcquire(key: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
    const recent = (this.starts.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.starts.set(key, recent);
      const retryAfterSec = Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 1000));
      return { ok: false, retryAfterSec };
    }
    recent.push(now);
    this.starts.set(key, recent);
    return { ok: true };
  }
}

/** The configured limit (TESTORA_RUNS_PER_TARGET_PER_HOUR, default 30). */
export function runsPerTargetPerHour(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.TESTORA_RUNS_PER_TARGET_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_RUNS_PER_TARGET_PER_HOUR;
}

/** Process-wide limiter (kept on globalThis so dev HMR doesn't reset it). */
export function runRateLimiter(): RunRateLimiter {
  const store = globalThis as { __testoraRunRateLimiter?: RunRateLimiter };
  store.__testoraRunRateLimiter ??= new RunRateLimiter(runsPerTargetPerHour());
  return store.__testoraRunRateLimiter;
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
