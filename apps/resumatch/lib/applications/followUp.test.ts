import { describe, expect, it } from "vitest";
import {
  followUpDateToDay,
  followUpDayToDate,
  followUpDueState,
  formatFollowUpDay,
  parseFollowUpDay,
  todayInTimeZone,
} from "./followUp";
import { APPLICATION_STATUSES } from "./constants";

describe("parseFollowUpDay", () => {
  it("accepts real calendar days", () => {
    for (const day of ["2026-11-19", "2028-02-29", "2026-12-31", "2027-01-01", "2000-01-01", "2100-12-31"]) {
      expect(parseFollowUpDay(day), day).toBe(day);
    }
  });

  it("rejects impossible, malformed and out-of-range days", () => {
    for (const day of [
      "2026-02-30",
      "2027-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-11-00",
      "2026-1-5",
      "11/19/2026",
      "",
      "0002-11-19",
      "1999-12-31",
      "2101-01-01",
      "2026-11-19T00:00:00Z",
    ]) {
      expect(parseFollowUpDay(day), day).toBeNull();
    }
  });
});

describe("storage round trip", () => {
  it("stores a day as UTC midnight and reads the same day back", () => {
    for (const day of ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01", "2028-02-29"]) {
      const stored = followUpDayToDate(day);
      expect(stored.toISOString()).toBe(`${day}T00:00:00.000Z`);
      expect(followUpDateToDay(stored)).toBe(day);
      // As the client receives it after JSON serialisation.
      expect(followUpDateToDay(JSON.parse(JSON.stringify(stored)))).toBe(day);
    }
  });

  it("reads a legacy timestamp as its UTC calendar day", () => {
    expect(followUpDateToDay(new Date("2026-12-01T08:30:00Z"))).toBe("2026-12-01");
    expect(followUpDateToDay(new Date("2026-12-01T23:59:59.999Z"))).toBe("2026-12-01");
  });

  it("reads no date as null", () => {
    expect(followUpDateToDay(null)).toBeNull();
    expect(followUpDateToDay(undefined)).toBeNull();
    expect(followUpDateToDay("not a date")).toBeNull();
  });
});

describe("todayInTimeZone", () => {
  it("gives each zone its own calendar day for the same instant", () => {
    // 2026-12-31 22:30 UTC: already New Year in Auckland and Kiritimati,
    // still 31 December in Los Angeles and Pago Pago.
    const instant = new Date("2026-12-31T22:30:00Z");
    expect(todayInTimeZone(instant, "UTC")).toBe("2026-12-31");
    expect(todayInTimeZone(instant, "Pacific/Auckland")).toBe("2027-01-01");
    expect(todayInTimeZone(instant, "Pacific/Kiritimati")).toBe("2027-01-01");
    expect(todayInTimeZone(instant, "America/Los_Angeles")).toBe("2026-12-31");
    expect(todayInTimeZone(instant, "Pacific/Pago_Pago")).toBe("2026-12-31");
  });

  it("crosses a month boundary west of UTC", () => {
    // 1 December 03:00 UTC is still 30 November in New York.
    expect(todayInTimeZone(new Date("2026-12-01T03:00:00Z"), "America/New_York")).toBe("2026-11-30");
  });

  it("is unaffected by DST changes", () => {
    // Europe: clocks go forward 29 March 2026 01:00 UTC and back 25 October.
    expect(todayInTimeZone(new Date("2026-03-29T00:30:00Z"), "Europe/Brussels")).toBe("2026-03-29");
    expect(todayInTimeZone(new Date("2026-03-28T22:59:00Z"), "Europe/Brussels")).toBe("2026-03-28");
    expect(todayInTimeZone(new Date("2026-03-29T22:30:00Z"), "Europe/Brussels")).toBe("2026-03-30");
    expect(todayInTimeZone(new Date("2026-10-25T22:30:00Z"), "Europe/Brussels")).toBe("2026-10-25");
    expect(todayInTimeZone(new Date("2026-10-25T23:30:00Z"), "Europe/Brussels")).toBe("2026-10-26");
    // US: forward 8 March 2026, back 1 November.
    expect(todayInTimeZone(new Date("2026-03-09T06:59:00Z"), "America/Los_Angeles")).toBe("2026-03-08");
    expect(todayInTimeZone(new Date("2026-03-09T07:00:00Z"), "America/Los_Angeles")).toBe("2026-03-09");
    expect(todayInTimeZone(new Date("2026-11-02T07:59:00Z"), "America/Los_Angeles")).toBe("2026-11-01");
    expect(todayInTimeZone(new Date("2026-11-02T08:00:00Z"), "America/Los_Angeles")).toBe("2026-11-02");
  });
});

describe("followUpDueState", () => {
  it("compares days, not instants", () => {
    expect(followUpDueState("2026-11-18", "2026-11-19", "APPLIED")).toBe("overdue");
    expect(followUpDueState("2026-11-19", "2026-11-19", "APPLIED")).toBe("today");
    expect(followUpDueState("2026-11-20", "2026-11-19", "APPLIED")).toBe("upcoming");
  });

  it("handles month and year boundaries", () => {
    expect(followUpDueState("2026-11-30", "2026-12-01", "SAVED")).toBe("overdue");
    expect(followUpDueState("2026-12-01", "2026-11-30", "SAVED")).toBe("upcoming");
    expect(followUpDueState("2026-12-31", "2027-01-01", "SAVED")).toBe("overdue");
    expect(followUpDueState("2027-01-01", "2026-12-31", "SAVED")).toBe("upcoming");
    expect(followUpDueState("2028-02-29", "2028-02-29", "SAVED")).toBe("today");
    expect(followUpDueState("2028-02-29", "2028-03-01", "SAVED")).toBe("overdue");
  });

  it("gives opposite UTC offsets their own today for the same stored day", () => {
    // The same instant, the same stored 1 January follow-up.
    const instant = new Date("2026-12-31T22:30:00Z");
    const day = followUpDateToDay(followUpDayToDate("2027-01-01"));
    expect(followUpDueState(day, todayInTimeZone(instant, "Pacific/Kiritimati"), "APPLIED")).toBe("today");
    expect(followUpDueState(day, todayInTimeZone(instant, "Pacific/Pago_Pago"), "APPLIED")).toBe("upcoming");
  });

  it("shows no urgency for closed applications, and again once reopened", () => {
    expect(followUpDueState("2026-11-01", "2026-11-19", "OFFER")).toBeNull();
    expect(followUpDueState("2026-11-19", "2026-11-19", "REJECTED")).toBeNull();
    expect(followUpDueState("2026-11-01", "2026-11-19", "INTERVIEWING")).toBe("overdue");
  });

  it("has nothing to say without a date", () => {
    for (const status of APPLICATION_STATUSES) expect(followUpDueState(null, "2026-11-19", status)).toBeNull();
  });
});

describe("formatFollowUpDay", () => {
  it("formats the stored day in every app locale without shifting it", () => {
    // Formatting in the viewer's zone would show 30 November for anyone
    // west of UTC; the day must stay 1 December.
    expect(formatFollowUpDay("2026-12-01", "en")).toBe("Dec 1, 2026");
    expect(formatFollowUpDay("2026-12-01", "en-GB")).toBe("1 Dec 2026");
    expect(formatFollowUpDay("2026-12-01", "nl")).toMatch(/^1 dec\.? 2026$/);
    expect(formatFollowUpDay("2026-12-01", "fr")).toMatch(/^1 déc\.? 2026$/);
    expect(formatFollowUpDay("2026-12-01", "de")).toBe("01.12.2026");
  });
});
