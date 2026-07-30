import { describe, expect, it } from "vitest";
import { cacheExpiryFor, describeFreshness, freshnessOfRow, isCacheUsable } from "./provenance";
import { REFERENCE_LIMITS } from "./limits";

/**
 * M13 slice F — freshness. The slice's exit criterion is that nothing ever
 * calls unavailable or old data "live", so this file exists mostly to pin
 * down the two cases that would break that: a copy inside its TTL whose last
 * REFRESH failed (stale, not cached), and any stored row at all (never
 * `live`, which is not even in the return type).
 */

const NOW = new Date("2026-07-29T12:00:00.000Z");
const FETCHED = new Date("2026-07-29T11:00:00.000Z");

function row(overrides: Partial<Parameters<typeof freshnessOfRow>[0]> = {}) {
  return {
    fetchedAt: FETCHED,
    cacheExpiresAt: cacheExpiryFor(FETCHED),
    failureCode: null,
    hasContent: true,
    ...overrides,
  };
}

describe("freshnessOfRow", () => {
  it("reports content inside its TTL as cached", () => {
    expect(freshnessOfRow(row(), NOW)).toBe("cached");
    expect(isCacheUsable(row(), NOW)).toBe(true);
  });

  it("reports content past its TTL as stale", () => {
    const expired = row({ cacheExpiresAt: new Date(NOW.getTime() - 1) });
    expect(freshnessOfRow(expired, NOW)).toBe("stale");
    expect(isCacheUsable(expired, NOW)).toBe(false);
  });

  it("downgrades to stale after a failed refresh even while still inside the TTL", () => {
    // The load-bearing case: serving an hour-old copy is fine, but calling it
    // `cached` right after the source refused to answer would report a
    // healthy pipeline that is not healthy.
    const failedRefresh = row({ failureCode: "rate_limited" });
    expect(freshnessOfRow(failedRefresh, NOW)).toBe("stale");
    expect(isCacheUsable(failedRefresh, NOW)).toBe(false);
  });

  it("reports a row with no content, or one that never fetched, as unavailable", () => {
    expect(freshnessOfRow(row({ hasContent: false }), NOW)).toBe("unavailable");
    expect(freshnessOfRow(row({ fetchedAt: null, cacheExpiresAt: null }), NOW)).toBe("unavailable");
    expect(freshnessOfRow(row({ hasContent: false, failureCode: "fetch_failed" }), NOW)).toBe("unavailable");
  });

  it("treats a missing expiry as stale rather than as indefinitely fresh", () => {
    expect(freshnessOfRow(row({ cacheExpiresAt: null }), NOW)).toBe("stale");
  });
});

describe("cacheExpiryFor", () => {
  it("uses the documented TTL by default", () => {
    expect(cacheExpiryFor(FETCHED).getTime() - FETCHED.getTime()).toBe(REFERENCE_LIMITS.CACHE_TTL_SECONDS * 1000);
  });
});

describe("describeFreshness", () => {
  it("says 'just fetched' only for a fetch that just happened", () => {
    expect(describeFreshness("live", FETCHED)).toMatch(/just fetched/i);
    for (const freshness of ["cached", "stale", "unavailable"] as const) {
      expect(describeFreshness(freshness, FETCHED).toLowerCase()).not.toContain("live");
    }
  });

  it("dates a cached copy and says a stale one is out of date", () => {
    expect(describeFreshness("cached", FETCHED)).toContain(FETCHED.toISOString());
    expect(describeFreshness("stale", FETCHED)).toMatch(/out of date/i);
    expect(describeFreshness("unavailable", null)).toMatch(/unavailable/i);
  });
});
