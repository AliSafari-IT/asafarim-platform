import { describe, expect, it } from "vitest";
import { assessFreshness, freshnessLabel, isDisplayable, statusForFreshness } from "./freshness";

const now = new Date("2026-09-04T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("freshness", () => {
  it("treats a recently seen, recently published posting as current", () => {
    expect(
      assessFreshness(
        { publishedAt: daysAgo(3), expiresAt: null, lastSeenAt: daysAgo(0), sourceTerminated: false },
        now,
      ),
    ).toBe("CURRENT");
  });

  it("labels an old posting rather than hiding it", () => {
    // Plenty of vacancies run for months. Showing the age and letting the
    // candidate judge beats silently dropping a job they could still get.
    const state = assessFreshness(
      { publishedAt: daysAgo(45), expiresAt: null, lastSeenAt: daysAgo(0), sourceTerminated: false },
      now,
    );
    expect(state).toBe("AGEING");
    expect(isDisplayable(state)).toBe(true);
  });

  it("expires a posting past its own expiry date", () => {
    const state = assessFreshness(
      { publishedAt: daysAgo(10), expiresAt: daysAgo(1), lastSeenAt: daysAgo(0), sourceTerminated: false },
      now,
    );
    expect(state).toBe("EXPIRED");
    expect(isDisplayable(state)).toBe(false);
  });

  it("catches a posting that vanished without ever being marked expired", () => {
    // The case the source's own dates cannot describe, and the most common
    // way a stale listing survives.
    const state = assessFreshness(
      { publishedAt: daysAgo(5), expiresAt: null, lastSeenAt: daysAgo(4), sourceTerminated: false },
      now,
    );
    expect(state).toBe("DISAPPEARED");
    expect(isDisplayable(state)).toBe(false);
  });

  it("tolerates a sync gap shorter than the disappearance window", () => {
    // Must not fire because ingestion was down over a weekend.
    expect(
      assessFreshness(
        { publishedAt: daysAgo(5), expiresAt: null, lastSeenAt: daysAgo(2), sourceTerminated: false },
        now,
      ),
    ).toBe("CURRENT");
  });

  it("hides everything from a terminated source, whatever its own dates say", () => {
    const state = assessFreshness(
      { publishedAt: daysAgo(1), expiresAt: null, lastSeenAt: daysAgo(0), sourceTerminated: true },
      now,
    );
    expect(state).toBe("WITHDRAWN");
    expect(isDisplayable(state)).toBe(false);
  });

  it("puts authorisation above every date", () => {
    // A terminated source outranks even a perfectly current posting.
    expect(
      assessFreshness(
        { publishedAt: daysAgo(0), expiresAt: null, lastSeenAt: daysAgo(0), sourceTerminated: true },
        now,
      ),
    ).toBe("WITHDRAWN");
  });
});

describe("freshness labels", () => {
  it("says nothing about a current posting", () => {
    expect(freshnessLabel("CURRENT", daysAgo(2), now)).toBeNull();
  });

  it("escalates its wording with age", () => {
    expect(freshnessLabel("AGEING", daysAgo(35), now)).toContain("over a month");
    expect(freshnessLabel("AGEING", daysAgo(65), now)).toContain("2 months");
    expect(freshnessLabel("AGEING", daysAgo(100), now)).toContain("may no longer be open");
  });
});

describe("status mapping", () => {
  it("maps each state to a storable status", () => {
    expect(statusForFreshness("CURRENT")).toBe("ACTIVE");
    expect(statusForFreshness("AGEING")).toBe("ACTIVE");
    expect(statusForFreshness("EXPIRED")).toBe("EXPIRED");
    expect(statusForFreshness("DISAPPEARED")).toBe("EXPIRED");
    expect(statusForFreshness("WITHDRAWN")).toBe("WITHDRAWN");
  });
});
