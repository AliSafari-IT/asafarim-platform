import { describe, expect, it, vi } from "vitest";
import { MAX_RESPONSE_BYTES, backoffMs, delayBetweenRequestsMs, fetchFeed, isRetryable } from "./http";

const endpoint = "https://feeds.example.test/jobs.json";

function respond(init: {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}): typeof fetch {
  const status = init.status ?? 200;
  // 204/304 must have a null body per the Fetch spec; giving them one makes
  // the Response constructor throw.
  const body = status === 204 || status === 304 ? null : (init.body ?? "[]");
  return vi.fn(async () =>
    new Response(body, { status, headers: init.headers ?? {} }),
  ) as unknown as typeof fetch;
}

describe("outbound fetching", () => {
  it("returns the body and validators on success", async () => {
    const result = await fetchFeed(
      endpoint,
      {},
      respond({ body: "[1]", headers: { etag: 'W/"abc"', "last-modified": "Wed, 03 Sep 2026 00:00:00 GMT" } }),
    );
    expect(result).toMatchObject({ ok: true, status: 200, body: "[1]", etag: 'W/"abc"' });
  });

  it("sends conditional headers so an unchanged sync costs the source nothing", async () => {
    const impl = respond({ status: 304 });
    const result = await fetchFeed(endpoint, { etag: 'W/"abc"', lastModified: "yesterday" }, impl);

    expect(result).toEqual({ ok: true, status: 304, notModified: true });
    const headers = (impl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
      .headers as Record<string, string>;
    expect(headers["if-none-match"]).toBe('W/"abc"');
    expect(headers["if-modified-since"]).toBe("yesterday");
  });

  it("refuses an endpoint that is not a public HTTPS address, before connecting", async () => {
    const impl = vi.fn() as unknown as typeof fetch;
    expect(await fetchFeed("https://169.254.169.254/meta", {}, impl)).toEqual({
      ok: false,
      reasonCode: "ENDPOINT_NOT_ALLOWED",
    });
    expect(impl).not.toHaveBeenCalled();
  });

  it("refuses to follow a redirect", async () => {
    // A permitted host redirecting to a private address is the standard SSRF
    // bypass; re-validating each hop is more moving parts than refusing.
    const result = await fetchFeed(endpoint, {}, respond({ status: 302, headers: { location: "https://127.0.0.1/" } }));
    expect(result).toEqual({ ok: false, reasonCode: "REDIRECT_REFUSED" });
  });

  it("reports rate limiting with the source's own retry hint", async () => {
    const result = await fetchFeed(endpoint, {}, respond({ status: 429, headers: { "retry-after": "42" } }));
    expect(result).toEqual({ ok: false, reasonCode: "RATE_LIMITED", retryAfterSeconds: 42 });
  });

  it("refuses an oversized response on the declared length", async () => {
    const result = await fetchFeed(
      endpoint,
      {},
      respond({ headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } }),
    );
    expect(result).toEqual({ ok: false, reasonCode: "RESPONSE_TOO_LARGE" });
  });

  it("refuses an oversized response that lied about its length", async () => {
    // Content-Length is the source's claim, not a fact.
    const result = await fetchFeed(
      endpoint,
      {},
      respond({ body: "x".repeat(MAX_RESPONSE_BYTES + 10), headers: { "content-length": "10" } }),
    );
    expect(result).toEqual({ ok: false, reasonCode: "RESPONSE_TOO_LARGE" });
  });

  it("reports an HTTP error without surfacing the response", async () => {
    const result = await fetchFeed(endpoint, {}, respond({ status: 500, body: "secret internals" }));
    expect(result).toEqual({ ok: false, reasonCode: "HTTP_ERROR" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("never puts the endpoint into a failure result", async () => {
    // Fetch errors embed the full URL, which for a partner API carries the
    // key in its query string.
    const failing = vi.fn(async () => {
      throw new Error(`getaddrinfo ENOTFOUND ${endpoint}?apiKey=super-secret`);
    }) as unknown as typeof fetch;

    const result = await fetchFeed(`${endpoint}?apiKey=super-secret`, {}, failing);
    expect(result).toEqual({ ok: false, reasonCode: "NETWORK_ERROR" });
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });
});

describe("rate limiting and backoff", () => {
  it("derives a delay from the agreed request rate", () => {
    expect(delayBetweenRequestsMs(60)).toBe(1000);
    expect(delayBetweenRequestsMs(20)).toBe(3000);
  });

  it("keeps the delay sane for absurd configuration", () => {
    expect(delayBetweenRequestsMs(0)).toBe(60_000);
    expect(delayBetweenRequestsMs(-5)).toBe(60_000);
    expect(delayBetweenRequestsMs(100_000)).toBe(100);
  });

  it("obeys a source that says when to come back", () => {
    expect(backoffMs(1, 30)).toBe(30_000);
  });

  it("backs off exponentially, with a ceiling", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(20)).toBe(60_000);
  });

  it("retries only what is worth retrying", () => {
    expect(isRetryable("RATE_LIMITED")).toBe(true);
    expect(isRetryable("TIMEOUT")).toBe(true);
    expect(isRetryable("NETWORK_ERROR")).toBe(true);
    // Retrying these just repeats the same refusal.
    expect(isRetryable("ENDPOINT_NOT_ALLOWED")).toBe(false);
    expect(isRetryable("REDIRECT_REFUSED")).toBe(false);
    expect(isRetryable("RESPONSE_TOO_LARGE")).toBe(false);
  });
});
