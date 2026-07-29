import {
  ReferenceFetchFailedError,
  ReferenceRateLimitedError,
  ReferenceTimeoutError,
  ReferenceTooLargeError,
  ReferenceTooManyRedirectsError,
  ReferenceUrlNotAllowedError,
  UnsupportedReferenceContentTypeError,
} from "./errors";
import { ALLOWED_REFERENCE_CONTENT_TYPES, REFERENCE_LIMITS } from "./limits";
import { assertImportableUrl, defaultHostResolver, type HostResolver } from "./urlPolicy";

/**
 * M13 slice F — the ONLY outbound HTTP path a reference import may take.
 * Nothing in this slice calls `fetch` directly; adapters (generic HTML,
 * GitHub) all go through here, so every bound below applies to all of them
 * without each adapter having to remember.
 *
 * The bounds, and why each one is here rather than "probably fine":
 *
 * - **Redirects are followed manually.** `redirect: "follow"` would hand the
 *   whole chain to the runtime, and the hop that matters is the one we never
 *   see: `https://evil.example/x` → `https://169.254.169.254/`. Every hop is
 *   re-run through `assertImportableUrl` (scheme, credentials, port, host
 *   shape, resolved addresses) from scratch. A cross-host redirect is not
 *   privileged by the first host having been allowed.
 * - **One timeout covers the whole chain**, not each hop, so three slow
 *   redirects cannot add up to three times the budget.
 * - **Size is enforced while streaming**, not from `Content-Length`. A host
 *   can omit or understate that header; reading until a cap and aborting is
 *   the only bound that actually holds. The declared length is still checked
 *   first as a cheap early exit.
 * - **Content type is an allowlist**, checked before the body is read, so an
 *   unsupported type costs nothing.
 * - **No cookies, no credentials, no caching.** `credentials: "omit"` means
 *   an import can never carry the platform's own session anywhere.
 */

export interface ReferenceFetchOptions {
  /** Overrides the default content-type allowlist (the GitHub adapter narrows it to JSON). */
  allowedContentTypes?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Extra request headers. Never credentials — reference imports are unauthenticated by design. */
  headers?: Record<string, string>;
}

export interface ReferenceFetchDeps {
  fetchImpl?: typeof fetch;
  resolveHost?: HostResolver;
}

export interface ReferenceFetchResult {
  /** The URL actually fetched after redirects — provenance's `finalUrl`. */
  finalUrl: string;
  status: number;
  /** Content type with parameters stripped and lowercased. */
  contentType: string;
  charset: string | null;
  body: Buffer;
  /** How many hops were followed (0 when the first response was terminal). */
  redirectCount: number;
  /** Response headers worth keeping for provenance/diagnostics — never the whole header set (Set-Cookie and friends stay out). */
  rateLimit: { remaining: number | null; resetAtSeconds: number | null };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const USER_AGENT = "AsafarimAppBuilder/1.0 (+https://appbuilder.asafarim.com; public reference import)";

function parseContentType(raw: string | null): { type: string; charset: string | null } {
  if (!raw) return { type: "", charset: null };
  const [typePart, ...params] = raw.split(";");
  let charset: string | null = null;
  for (const param of params) {
    const [key, value] = param.split("=");
    if (key?.trim().toLowerCase() === "charset" && value) {
      charset = value.trim().replace(/^["']|["']$/g, "").toLowerCase();
    }
  }
  return { type: typePart.trim().toLowerCase(), charset };
}

function readRateLimit(response: Response): { remaining: number | null; resetAtSeconds: number | null } {
  const remainingRaw = response.headers.get("x-ratelimit-remaining");
  const resetRaw = response.headers.get("x-ratelimit-reset");
  const remaining = remainingRaw !== null && /^\d+$/.test(remainingRaw) ? Number(remainingRaw) : null;
  const resetAtSeconds = resetRaw !== null && /^\d+$/.test(resetRaw) ? Number(resetRaw) : null;
  return { remaining, resetAtSeconds };
}

function retryAfterSeconds(response: Response, resetAtSeconds: number | null, nowMs: number): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter);
  if (resetAtSeconds !== null) return Math.max(0, Math.round(resetAtSeconds - nowMs / 1000));
  return null;
}

/**
 * Reads at most `maxBytes` and throws if the body is longer. Streaming is
 * the load-bearing part: a decompression-bomb or endless-stream response
 * must be cut off mid-transfer, not discovered after it has been buffered.
 * `arrayBuffer()` is a fallback only for responses with no readable stream
 * (some mocked/synthetic responses), and it re-checks the same cap.
 */
async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new ReferenceTooLargeError(maxBytes);
  }

  const body = response.body;
  if (!body || typeof (body as ReadableStream<Uint8Array>).getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new ReferenceTooLargeError(maxBytes);
    return buffer;
  }

  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new ReferenceTooLargeError(maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    // Releases the connection immediately on the over-size path instead of
    // leaving the rest of a hostile response streaming in the background.
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches one public HTTPS URL under every bound in REFERENCE_LIMITS.
 * Throws a `Reference*Error` for anything that is not a usable 2xx response
 * of an allowed type — callers never see a raw `Response` or a transport
 * error.
 */
export async function fetchBoundedReference(
  rawUrl: string,
  options: ReferenceFetchOptions = {},
  deps: ReferenceFetchDeps = {},
): Promise<ReferenceFetchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveHost = deps.resolveHost ?? defaultHostResolver;
  const allowedContentTypes = options.allowedContentTypes ?? ALLOWED_REFERENCE_CONTENT_TYPES;
  const maxBytes = options.maxBytes ?? REFERENCE_LIMITS.MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? REFERENCE_LIMITS.TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? REFERENCE_LIMITS.MAX_REDIRECTS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target = await assertImportableUrl(rawUrl, resolveHost);
    let redirectCount = 0;

    for (;;) {
      let response: Response;
      try {
        response = await fetchImpl(target.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          headers: {
            accept: allowedContentTypes.join(", "),
            "accept-language": "en",
            "user-agent": USER_AGENT,
            ...(options.headers ?? {}),
          },
        });
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          throw new ReferenceTimeoutError(timeoutMs);
        }
        throw new ReferenceFetchFailedError("That site could not be reached, so nothing was imported.");
      }

      const rateLimit = readRateLimit(response);

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new ReferenceFetchFailedError("That site returned an incomplete redirect, so nothing was imported.", response.status);
        }
        if (redirectCount >= maxRedirects) {
          throw new ReferenceTooManyRedirectsError(maxRedirects);
        }
        let next: string;
        try {
          next = new URL(location, target).toString();
        } catch {
          throw new ReferenceUrlNotAllowedError("That site redirected to an address that cannot be imported.", "malformed_redirect");
        }
        // The whole point of manual redirects: the destination is validated
        // exactly as strictly as the URL the user typed, including a fresh
        // DNS check. A redirect never inherits the previous hop's approval.
        target = await assertImportableUrl(next, resolveHost);
        redirectCount += 1;
        continue;
      }

      if (response.status === 429 || (response.status === 403 && rateLimit.remaining === 0)) {
        throw new ReferenceRateLimitedError(target.hostname, retryAfterSeconds(response, rateLimit.resetAtSeconds, Date.now()));
      }

      if (!response.ok) {
        throw new ReferenceFetchFailedError(
          response.status === 404
            ? "That page was not found, so nothing was imported."
            : "That site refused the request, so nothing was imported.",
          response.status,
        );
      }

      const { type, charset } = parseContentType(response.headers.get("content-type"));
      if (!allowedContentTypes.includes(type)) {
        throw new UnsupportedReferenceContentTypeError(type || null);
      }

      const body = await readBounded(response, maxBytes);
      return {
        finalUrl: target.toString(),
        status: response.status,
        contentType: type,
        charset,
        body,
        redirectCount,
        rateLimit,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
