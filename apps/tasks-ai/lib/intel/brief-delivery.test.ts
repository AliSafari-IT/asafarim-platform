import { describe, expect, it } from "vitest";
import { isLocalMorning, isInQuietHours } from "./brief-delivery";

describe("isLocalMorning", () => {
  it("is true inside the 06:00-10:00 local window", () => {
    // 08:00 UTC, Europe/Brussels is UTC+2 in September → 10:00 local, edge (excluded)
    expect(isLocalMorning(new Date("2026-09-16T06:30:00Z"), "UTC")).toBe(true);
    expect(isLocalMorning(new Date("2026-09-16T09:59:00Z"), "UTC")).toBe(true);
  });

  it("is false outside the window", () => {
    expect(isLocalMorning(new Date("2026-09-16T05:59:00Z"), "UTC")).toBe(false);
    expect(isLocalMorning(new Date("2026-09-16T10:00:00Z"), "UTC")).toBe(false);
    expect(isLocalMorning(new Date("2026-09-16T23:00:00Z"), "UTC")).toBe(false);
  });

  it("resolves per-member timezone, not the server's", () => {
    // 04:00 UTC is 06:00 in Europe/Brussels (UTC+2 in September) — morning
    // there, but not yet morning in UTC.
    const t = new Date("2026-09-16T04:00:00Z");
    expect(isLocalMorning(t, "UTC")).toBe(false);
    expect(isLocalMorning(t, "Europe/Brussels")).toBe(true);
  });

  it("falls back to UTC for an invalid timezone instead of throwing", () => {
    expect(() => isLocalMorning(new Date("2026-09-16T07:00:00Z"), "Not/AZone")).not.toThrow();
  });
});

describe("isInQuietHours", () => {
  it("returns false when no quiet hours are set", () => {
    expect(isInQuietHours(new Date("2026-09-16T23:30:00Z"), "UTC", null)).toBe(false);
  });

  it("handles a same-day window", () => {
    expect(isInQuietHours(new Date("2026-09-16T13:00:00Z"), "UTC", "12:00-14:00")).toBe(true);
    expect(isInQuietHours(new Date("2026-09-16T15:00:00Z"), "UTC", "12:00-14:00")).toBe(false);
  });

  it("handles a window that wraps midnight", () => {
    expect(isInQuietHours(new Date("2026-09-16T23:30:00Z"), "UTC", "22:00-07:00")).toBe(true);
    expect(isInQuietHours(new Date("2026-09-16T03:00:00Z"), "UTC", "22:00-07:00")).toBe(true);
    expect(isInQuietHours(new Date("2026-09-16T08:00:00Z"), "UTC", "22:00-07:00")).toBe(false);
  });
});
