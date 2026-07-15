/**
 * Small HTTP utilities for talking to Google APIs:
 *  - retry with exponential backoff + jitter on 429 / 5xx
 *  - bounded-concurrency map for batched downloads
 *
 * Centralised so the OAuth, picker, and ingest layers behave consistently
 * under rate limits and transient failures (milestone issue #155).
 */

export class GoogleApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `Google API error ${status}: ${body.slice(0, 300)}`);
    this.name = "GoogleApiError";
    this.status = status;
    this.body = body;
  }
}

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable sleep — tests pass a no-op to avoid real timers. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffDelay(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt);
  // Full jitter to avoid thundering-herd retries.
  return Math.floor(Math.random() * exp);
}

/**
 * `fetch` with retry on transient failures. Honors a `Retry-After` header when
 * present. Throws {@link GoogleApiError} on a non-OK terminal response.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !isRetryableStatus(res.status) || attempt === retries) {
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : backoffDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    } catch (error) {
      // Network-level failure — retry unless we're out of attempts.
      lastError = error;
      if (attempt === retries) throw error;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  // Unreachable, but keeps the type checker happy.
  throw lastError ?? new Error("fetchWithRetry exhausted retries");
}

/** Parse a Response as JSON, throwing {@link GoogleApiError} on non-OK. */
export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleApiError(res.status, body);
  }
  return (await res.json()) as T;
}

/**
 * Map over `items` with at most `concurrency` in-flight tasks. Preserves input
 * order in the result array. Never rejects for an individual item — the worker
 * is responsible for catching and shaping per-item outcomes.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));

  async function run(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}
