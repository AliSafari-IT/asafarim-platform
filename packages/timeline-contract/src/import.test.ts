import { describe, expect, it } from "vitest";
import { parseTemporalPhrase } from "./temporal-parse";
import { TIMELINE_EVENTS_CONTRACT_VERSION, toTimelineEventsImport } from "./import";

describe("toTimelineEventsImport", () => {
  it("sets startAt only for day-exact dates and keeps the stated precision", () => {
    const result = toTimelineEventsImport([
      { title: "Exact", when: parseTemporalPhrase("15 June 2021"), citations: [{ label: "S1", excerpt: "…" }], confidence: "high", inferred: false },
      { title: "Coarse", when: parseTemporalPhrase("the 1990s"), citations: [{ label: "S2" }], confidence: "medium", inferred: false },
      { title: "Span", when: parseTemporalPhrase("between 2021-01-04 and 2021-03-01"), citations: [{ label: "S3" }], confidence: "high", inferred: false },
    ])!;
    expect(result.contractVersion).toBe(TIMELINE_EVENTS_CONTRACT_VERSION);
    const [exact, coarse, span] = result.payload.events;
    expect(exact).toMatchObject({ startAt: "2021-06-15T00:00:00.000Z", displayDate: "15 June 2021", temporalValue: { precision: "day" } });
    expect(coarse.startAt).toBeUndefined();
    expect(coarse.temporalValue).toMatchObject({ precision: "decade", year: 1990 });
    expect(span).toMatchObject({ startAt: "2021-01-04T00:00:00.000Z", endAt: "2021-03-01T00:00:00.000Z" });
  });

  it("marks uncited or inferred events as uncited inferences instead of dropping them", () => {
    const [a, b] = toTimelineEventsImport([
      { title: "No citation", when: parseTemporalPhrase("1969"), citations: [], confidence: "low", inferred: false },
      { title: "Inferred", when: parseTemporalPhrase("1970"), citations: [{ label: "S1" }], confidence: "low", inferred: true },
    ])!.payload.events;
    expect(a.uncitedInference).toBe(true);
    expect(b.uncitedInference).toBe(true);
  });

  it("returns null for nothing to import and clips to TimelineAI's limits", () => {
    expect(toTimelineEventsImport([])).toBeNull();
    const [e] = toTimelineEventsImport([
      { title: "x".repeat(300), when: parseTemporalPhrase("y".repeat(200)), citations: [{ label: "l".repeat(300), excerpt: "e".repeat(900) }], confidence: "low", inferred: false },
    ])!.payload.events;
    expect(e.title).toHaveLength(200);
    expect(e.displayDate).toHaveLength(64);
    expect(e.temporalValue?.displayText).toHaveLength(120);
    expect(e.citations[0].label).toHaveLength(200);
    expect(e.citations[0].excerpt).toHaveLength(500);
  });
});
