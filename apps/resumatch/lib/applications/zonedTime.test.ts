import { describe, expect, it } from "vitest";
import { formatZoned, isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "./zonedTime";

describe("zonedLocalToUtc", () => {
  it("turns a Brussels wall-clock time into UTC, in winter and summer", () => {
    expect(zonedLocalToUtc("2026-11-20T14:30", "Europe/Brussels")?.toISOString()).toBe("2026-11-20T13:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:00", "Europe/Brussels")?.toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("handles zones west of UTC and across midnight", () => {
    expect(zonedLocalToUtc("2026-11-20T22:15", "America/Los_Angeles")?.toISOString()).toBe("2026-11-21T06:15:00.000Z");
    expect(zonedLocalToUtc("2026-11-21T08:00", "Pacific/Auckland")?.toISOString()).toBe("2026-11-20T19:00:00.000Z");
  });

  it("takes the first of a repeated hour and moves a skipped time past the jump", () => {
    // 25 Oct 2026, 02:30 happens twice in Brussels: CEST first.
    expect(zonedLocalToUtc("2026-10-25T02:30", "Europe/Brussels")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // 29 Mar 2026, 02:30 never happens in Brussels.
    const skipped = zonedLocalToUtc("2026-03-29T02:30", "Europe/Brussels");
    expect(skipped).not.toBeNull();
    expect(utcToZonedLocal(skipped!, "Europe/Brussels")).toBe("2026-03-29T03:30");
  });

  it("refuses impossible dates, bad zones and out-of-range years", () => {
    expect(zonedLocalToUtc("2026-02-30T10:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20T24:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20 10:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("2026-11-20T10:00", "Mars/Olympus")).toBeNull();
    expect(zonedLocalToUtc("1999-12-31T10:00", "UTC")).toBeNull();
  });
});

describe("utcToZonedLocal and formatZoned", () => {
  it("round-trips the wall-clock time the candidate typed", () => {
    for (const zone of ["Europe/Brussels", "Asia/Kolkata", "America/New_York", "UTC"]) {
      const at = zonedLocalToUtc("2026-11-03T07:45", zone)!;
      expect(utcToZonedLocal(at, zone)).toBe("2026-11-03T07:45");
    }
  });

  it("formats in the stored zone, whatever the runtime's own", () => {
    const text = formatZoned("2026-11-20T13:30:00.000Z", "Europe/Brussels", "en-GB");
    expect(text).toContain("14:30");
    expect(text).toMatch(/CET|GMT\+1/);
  });

  it("validates zones", () => {
    expect(isValidTimeZone("Europe/Brussels")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Europe/Nowhere")).toBe(false);
    expect(isValidTimeZone("<script>")).toBe(false);
  });
});
