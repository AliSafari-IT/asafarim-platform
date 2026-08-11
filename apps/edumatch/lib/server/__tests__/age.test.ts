import { describe, expect, it } from "vitest";
import { computeAgeOn, isUnder13 } from "../age";

describe("computeAgeOn", () => {
  it("counts a full birthday as the new age", () => {
    expect(computeAgeOn(new Date("2013-08-11"), new Date("2026-08-11"))).toBe(13);
  });

  it("does not count the day before the birthday as the new age", () => {
    expect(computeAgeOn(new Date("2013-08-11"), new Date("2026-08-10"))).toBe(12);
  });

  it("handles a leap-year birth date (Feb 29)", () => {
    // 2012 is a leap year; by 2026-02-28 the birthday hasn't happened yet.
    expect(computeAgeOn(new Date("2012-02-29"), new Date("2026-02-28"))).toBe(13);
    expect(computeAgeOn(new Date("2012-02-29"), new Date("2026-03-01"))).toBe(14);
  });

  it("uses UTC so a local timezone can't shift the birthday", () => {
    // Both dates carry an explicit UTC offset; computeAgeOn should ignore it
    // and compare in UTC only.
    const dob = new Date("2013-08-11T23:00:00Z");
    const now = new Date("2026-08-11T01:00:00Z");
    expect(computeAgeOn(dob, now)).toBe(13);
  });
});

describe("isUnder13", () => {
  it("treats a missing date of birth as the safest default (under 13)", () => {
    expect(isUnder13(null)).toBe(true);
    expect(isUnder13(undefined)).toBe(true);
  });

  it("is true the day before turning 13, false on/after the birthday", () => {
    const now = new Date("2026-08-11");
    expect(isUnder13(new Date("2013-08-12"), now)).toBe(true);
    expect(isUnder13(new Date("2013-08-11"), now)).toBe(false);
  });

  it("is false for an adult", () => {
    expect(isUnder13(new Date("1990-01-01"), new Date("2026-08-11"))).toBe(false);
  });
});
