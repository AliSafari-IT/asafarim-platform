import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry, mapLimit, readJson, GoogleApiError } from "../google-photos/http";

const noSleep = () => Promise.resolve();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns immediately on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://x", {}, { sleep: noSleep });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://x", {}, { sleep: noSleep, retries: 3 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and returns the last response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://x", {}, { sleep: noSleep, retries: 2 });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://x", {}, { sleep: noSleep });
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("readJson", () => {
  it("throws GoogleApiError on non-OK", async () => {
    await expect(readJson(new Response("bad", { status: 401 }))).rejects.toBeInstanceOf(
      GoogleApiError,
    );
  });
});

describe("mapLimit", () => {
  it("preserves order and caps concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = await mapLimit(items, 3, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
