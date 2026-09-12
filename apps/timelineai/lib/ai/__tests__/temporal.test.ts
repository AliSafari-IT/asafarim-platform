import { describe, expect, it } from "vitest";
import { compareTemporalValues, temporalSortKey, detectTemporalConflicts, type TemporalValue } from "../temporal";

function year(y: number, era: "CE" | "BCE" = "CE"): TemporalValue {
  return { precision: "year", era, year: y, displayText: String(y) };
}
function day(y: number, m: number, d: number): TemporalValue {
  return { precision: "day", era: "CE", year: y, month: m, day: d, displayText: `${y}-${m}-${d}` };
}
function decade(y: number): TemporalValue {
  return { precision: "decade", era: "CE", year: y, displayText: `${y}s` };
}
function unknown(): TemporalValue {
  return { precision: "unknown", era: "CE", displayText: "sometime" };
}
function range(start: TemporalValue, end: TemporalValue): TemporalValue {
  return { precision: "range", era: "CE", rangeStart: start, rangeEnd: end, displayText: "a range" };
}

describe("compareTemporalValues — deterministic ordering", () => {
  it("orders exact dates chronologically", () => {
    expect(compareTemporalValues(day(2020, 1, 1), day(2021, 1, 1))).toBeLessThan(0);
  });

  it("orders a decade before an exact day within it (coarser sorts first on tie)", () => {
    expect(compareTemporalValues(decade(1920), day(1925, 6, 1))).toBeLessThan(0);
  });

  it("sorts BCE years before CE years", () => {
    expect(compareTemporalValues(year(100, "BCE"), year(1, "CE"))).toBeLessThan(0);
  });

  it("sorts unknown-precision events last, deterministically", () => {
    const values = [year(2020), unknown(), year(1990)];
    const sorted = [...values].sort(compareTemporalValues);
    expect(sorted.map((v) => v.precision)).toEqual(["year", "year", "unknown"]);
  });

  it("is a stable total order (sort key is a plain finite number for anything with a year)", () => {
    expect(Number.isFinite(temporalSortKey(year(2020)))).toBe(true);
    expect(temporalSortKey(unknown())).toBe(Number.POSITIVE_INFINITY);
  });

  it("sorts a range by its start", () => {
    const early = range(year(2000), year(2005));
    const late = range(year(2010), year(2015));
    expect(compareTemporalValues(early, late)).toBeLessThan(0);
  });
});

describe("detectTemporalConflicts", () => {
  it("flags an impossible range (end before start)", () => {
    const events = [{ id: "e1", value: range(year(2020), year(2010)) }];
    const conflicts = detectTemporalConflicts(events);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe("impossible_range");
  });

  it("does not flag a valid range", () => {
    const events = [{ id: "e1", value: range(year(2010), year(2020)) }];
    expect(detectTemporalConflicts(events)).toHaveLength(0);
  });

  it("flags a before/after cycle", () => {
    const events = [
      { id: "a", value: year(2020) },
      { id: "b", value: year(2021) },
    ];
    const constraints = [
      { eventId: "a", beforeEventId: "b" },
      { eventId: "b", beforeEventId: "a" },
    ];
    const conflicts = detectTemporalConflicts(events, constraints);
    expect(conflicts.some((c) => c.code === "ordering_cycle")).toBe(true);
  });

  it("flags a before-constraint that contradicts the events' own resolved dates", () => {
    const events = [
      { id: "a", value: year(2021) },
      { id: "b", value: year(2020) },
    ];
    // constraint says a is before b, but a's own date (2021) is later than b's (2020)
    const conflicts = detectTemporalConflicts(events, [{ eventId: "a", beforeEventId: "b" }]);
    expect(conflicts.some((c) => c.code === "ordering_violation")).toBe(true);
  });

  it("never auto-resolves — returns conflicts for review rather than mutating input", () => {
    const events = [{ id: "e1", value: range(year(2020), year(2010)) }];
    const before = JSON.parse(JSON.stringify(events));
    detectTemporalConflicts(events);
    expect(events).toEqual(before);
  });

  it("returns no conflicts for well-ordered, unconstrained events", () => {
    const events = [
      { id: "a", value: year(2000) },
      { id: "b", value: year(2010) },
      { id: "c", value: unknown() },
    ];
    expect(detectTemporalConflicts(events)).toHaveLength(0);
  });
});
