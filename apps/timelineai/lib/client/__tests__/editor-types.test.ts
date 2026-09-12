import { describe, expect, it } from "vitest";
import { blankEvent, toTimelineInput, type EditorState } from "../editor-types";

function baseState(events: EditorState["events"]): EditorState {
  return {
    title: "A timeline",
    subtitle: "",
    description: "",
    timelineType: "general",
    layout: "vertical",
    theme: null,
    sortMode: "chronological",
    events,
  };
}

describe("toTimelineInput chronological sort", () => {
  it("sorts by startAt when no event has a recorded temporalPrecision", () => {
    const later = { ...blankEvent(0), title: "Later", startAt: "2020-01-01T00:00:00.000Z" };
    const earlier = { ...blankEvent(1), title: "Earlier", startAt: "1990-01-01T00:00:00.000Z" };
    const result = toTimelineInput(baseState([later, earlier]));
    expect(result.events.map((e) => e.title)).toEqual(["Earlier", "Later"]);
  });

  it("places an event with no date last, same as an 'unknown'-precision event", () => {
    const undated = { ...blankEvent(0), title: "Undated" };
    const dated = { ...blankEvent(1), title: "Dated", startAt: "2000-01-01T00:00:00.000Z" };
    const result = toTimelineInput(baseState([undated, dated]));
    expect(result.events.map((e) => e.title)).toEqual(["Dated", "Undated"]);
  });

  it("sorts a decade-precision event (no startAt) by its anchor year via temporalSortKey, not last", () => {
    // A "1990s" event has no exact startAt but does have a resolvable
    // anchor year — lib/ai/temporal.ts#temporalSortKey is what the server's
    // own conflict detection uses, so the editor should place this between
    // 1985 and 2010, not push it to the end for lacking a startAt.
    const nineties = {
      ...blankEvent(0),
      title: "The 1990s",
      temporalPrecision: { precision: "decade" as const, era: "CE" as const, year: 1990, displayText: "the 1990s" },
    };
    const before = { ...blankEvent(1), title: "1985", startAt: "1985-01-01T00:00:00.000Z" };
    const after = { ...blankEvent(2), title: "2010", startAt: "2010-01-01T00:00:00.000Z" };
    const result = toTimelineInput(baseState([after, nineties, before]));
    expect(result.events.map((e) => e.title)).toEqual(["1985", "The 1990s", "2010"]);
  });

  it("never sends temporalPrecision to the server — it's display/sort-only", () => {
    const event = {
      ...blankEvent(0),
      title: "Dated",
      temporalPrecision: { precision: "year" as const, era: "CE" as const, year: 2000, displayText: "2000" },
    };
    const result = toTimelineInput(baseState([event]));
    expect(result.events[0]).not.toHaveProperty("temporalPrecision");
  });
});
