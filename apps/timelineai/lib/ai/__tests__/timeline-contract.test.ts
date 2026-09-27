import { describe, expect, it } from "vitest";
import { parseTemporalPhrase, TIMELINE_EVENTS_CONTRACT_VERSION, toTimelineEventsImport, type ReviewedTimelineEvent } from "@asafarim/timeline-contract";
import { EventsExtractionPayloadSchema } from "../schemas";
import { TemporalValueSchema } from "../temporal";

/**
 * TimelineAI owns @asafarim/timeline-contract: these tests fail if the
 * shared import shape stops matching what TimelineAI's own schemas accept,
 * so another app's handoff can't silently drift.
 */
const reviewed: ReviewedTimelineEvent[] = [
  { title: "Exact day", when: parseTemporalPhrase("15 June 2021"), citations: [{ label: "S1", excerpt: "On 15 June 2021 …" }], confidence: "high", inferred: false },
  { title: "Decade", when: parseTemporalPhrase("the 1990s"), citations: [{ label: "S2" }], confidence: "medium", inferred: false },
  { title: "Range", when: parseTemporalPhrase("between 2020 and 2022"), citations: [{ label: "S3" }], confidence: "medium", inferred: false },
  { title: "BCE", when: parseTemporalPhrase("circa 1200 BCE"), citations: [], confidence: "low", inferred: true },
  { title: "Undated", when: parseTemporalPhrase("some time later"), citations: [{ label: "S4" }], confidence: "low", inferred: false },
];

describe("@asafarim/timeline-contract ↔ TimelineAI schemas", () => {
  it(`${TIMELINE_EVENTS_CONTRACT_VERSION} payloads parse as TimelineAI events_extraction proposals`, () => {
    const result = toTimelineEventsImport(reviewed)!;
    const parsed = EventsExtractionPayloadSchema.safeParse(result.payload);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("every value the shared parser produces satisfies TimelineAI's temporal schema", () => {
    for (const phrase of ["2021-06-15", "15 June 2021", "June 2021", "Q3 1999", "summer 2019", "1920s", "19th century", "between 2020 and 2022", "circa 1200 BCE", "unclear"]) {
      expect(TemporalValueSchema.safeParse(parseTemporalPhrase(phrase)).success, phrase).toBe(true);
    }
  });
});
