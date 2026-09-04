import "server-only";
import { isPublicHttpsUrl } from "./authorization";

/**
 * Outbound fetching for connectors (JM-030).
 *
 * A connector endpoint is operator-supplied configuration, which makes every
 * request a potential server-side request forgery: point a source at the
 * cloud metadata service and the sync fetches credentials on an attacker's
 * behalf. So this is the only way ingestion reaches the network, and it is
 * deliberately narrow.
 *
 * - HTTPS only, to a public address, checked *again* here and not merely at
 *   configuration time.
 * - Redirects are not followed. A permitted URL that redirects to a private
 *   one is the classic bypass, and re-validating each hop is more moving
 *   parts than refusing is worth.
 * - A response size cap, so a hostile or broken source cannot exhaust memory.
 * - A timeout, so a slow source cannot hold a sync open indefinitely.
 * - Conditional requests, so a sync that changes nothing costs the source
 *   nothing — politeness that agreements often require explicitly.
 */

export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 20_000;

export type FetchOutcome =
  | { ok: true; status: 200; body: string; etag: string | null; lastModified: string | null }
  | { ok: true; status: 304; notModified: true }
  | { ok: false; reasonCode: FetchRefusal; retryAfterSeconds?: number };

export type FetchRefusal =
  | "ENDPOINT_NOT_ALLOWED"
  | "REDIRECT_REFUSED"
  | "RATE_LIMITED"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "NETWORK_ERROR";

export interface ConditionalHeaders {
  etag?: string | null;
  lastModified?: string | null;
}

export async function fetchFeed(
  endpoint: string,
  conditional: ConditionalHeaders = {},
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  if (!isPublicHttpsUrl(endpoint)) return { ok: false, reasonCode: "ENDPOINT_NOT_ALLOWED" };

  const headers: Record<string, string> = {
    accept: "application/json",
    // Identifying the client is basic courtesy and is required by many
    // agreements. It carries no candidate information.
    "user-agent": "JobMatch/1.0 (+https://jobmatch.asafarim.com)",
  };
  if (conditional.etag) headers["if-none-match"] = conditional.etag;
  if (conditional.lastModified) headers["if-modified-since"] = conditional.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint, {
      headers,
      // Not "follow". A redirect from a permitted host to a private address
      // is the standard SSRF bypass, and each hop would need re-validating.
      redirect: "manual",
      signal: controller.signal,
    });

    // 304 is checked before the redirect range, and the order is not
    // cosmetic: 304 sits inside 3xx, so testing the range first classified
    // every successful conditional request as a refused redirect — which
    // would have quietly disabled the one courtesy most agreements ask for.
    if (response.status === 304) return { ok: true, status: 304, notModified: true };

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, reasonCode: "REDIRECT_REFUSED" };
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get("retry-after"));
      return {
        ok: false,
        reasonCode: "RATE_LIMITED",
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
      };
    }
    if (!response.ok) return { ok: false, reasonCode: "HTTP_ERROR" };

    // Checked before reading, when the source declares it, and again after,
    // because Content-Length is the source's claim rather than a fact.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      return { ok: false, reasonCode: "RESPONSE_TOO_LARGE" };
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      return { ok: false, reasonCode: "RESPONSE_TOO_LARGE" };
    }

    return {
      ok: true,
      status: 200,
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  } catch (error) {
    // The error itself is never surfaced or logged: fetch errors embed the
    // full URL, which for a partner API carries the key in its query string.
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reasonCode: "TIMEOUT" };
    }
    return { ok: false, reasonCode: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Delay between requests implied by a source's agreed rate.
 *
 * Rate limits in an agreement are a commitment, not a suggestion, and the
 * cost of breaching one is losing the source entirely.
 */
export function delayBetweenRequestsMs(requestsPerMinute: number): number {
  const safe = Math.max(1, Math.min(600, requestsPerMinute));
  return Math.ceil(60_000 / safe);
}

/** Exponential backoff with a ceiling, for retryable failures. */
export function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    // A source that tells us when to come back is obeyed rather than guessed at.
    return Math.min(retryAfterSeconds * 1000, 300_000);
  }
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), 60_000);
}

/** Which failures are worth retrying at all. */
export function isRetryable(reason: FetchRefusal): boolean {
  return reason === "RATE_LIMITED" || reason === "TIMEOUT" || reason === "NETWORK_ERROR";
}
