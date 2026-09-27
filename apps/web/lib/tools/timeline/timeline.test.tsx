import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../content/tools";
import { timelineExampleOutput as timeline } from "../../../content/tool-fixtures/text-to-cited-timeline";
import { applyEventEdit, eventDraft, initialTimelineReview, timelineReducer, toExportJson, toMarkdown, toTimelineAiImport, type TimelineAction, type TimelineReview } from "./review";
import { TimelineEditor } from "./TimelineEditor";
import { TimelineWorkbench } from "./TimelineWorkbench";

const start = initialTimelineReview(timeline, "example");
const apply = (...actions: TimelineAction[]) => actions.reduce<TimelineReview>(timelineReducer, start);
const status = (r: TimelineReview, id: string) => r.events.find((e) => e.id === id)?.status;

describe("review state", () => {
  it("accepts cited events outside conflicts; inferred and conflicted events wait for a decision", () => {
    expect(status(start, "EV-01")).toBe("accepted");
    expect(status(start, "EV-03")).toBe("pending");
    expect(status(start, "EV-04")).toBe("pending");
    expect(status(start, "EV-06")).toBe("pending");
    expect(status(start, "EV-10")).toBe("pending");
    expect(start.conflicts.every((c) => c.status === "open")).toBe(true);
  });

  it("accept/reject individual events and 'accept all cited' leaves inferred events alone", () => {
    const r = apply({ type: "set-status", id: "EV-05", status: "rejected" }, { type: "accept-all-cited" });
    expect(status(r, "EV-05")).toBe("rejected");
    expect(status(r, "EV-04")).toBe("accepted");
    expect(status(r, "EV-10")).toBe("pending");
  });

  it("records a deliberate unresolved decision with a note", () => {
    const r = apply({ type: "set-conflict", id: "CF1", status: "unresolved", note: "Both sources are credible." });
    expect(r.conflicts[0]).toMatchObject({ status: "unresolved", note: "Both sources are credible." });
  });

  it("reorders manually and sorts back by date with undated events last", () => {
    const moved = apply({ type: "move", id: "EV-02", by: -1 });
    expect(moved.events.slice(0, 2).map((e) => e.id)).toEqual(["EV-02", "EV-01"]);
    expect(timelineReducer(moved, { type: "sort-by-date" }).events.map((e) => e.id)).toEqual(start.events.map((e) => e.id));
  });

  it("edits re-read the date with TimelineAI's parser and mark it as edited", () => {
    const ev3 = start.events.find((e) => e.id === "EV-03")!;
    const result = applyEventEdit(ev3, { ...eventDraft(ev3), dateText: "1924" });
    expect(result).toMatchObject({ ok: true, event: { when: { precision: "year", year: 1924 }, dateEdited: true, origin: "edited", basis: "cited" } });
    const vague = applyEventEdit(ev3, { ...eventDraft(ev3), dateText: "some time before the war" });
    expect(vague.ok && vague.event.when.precision).toBe("unknown");
    const untouched = applyEventEdit(ev3, { ...eventDraft(ev3), title: "Moved" });
    expect(untouched.ok && untouched.event.dateEdited).toBeUndefined();
    expect(applyEventEdit(ev3, { ...eventDraft(ev3), title: " " })).toEqual({ ok: false, errors: ["Add a title."] });
  });
});

describe("export", () => {
  const reviewed = apply({ type: "set-status", id: "EV-05", status: "rejected" }, { type: "set-status", id: "EV-04", status: "accepted" }, { type: "set-status", id: "EV-03", status: "accepted" }, { type: "set-conflict", id: "CF1", status: "corrected" });

  it("JSON carries only accepted events with precision, sources, and uncertainty, and counts the rest", () => {
    const json = toExportJson(timeline, reviewed, new Date("2026-09-27T00:00:00Z"));
    expect(json.schemaVersion).toBe("cited-timeline/1");
    expect(json.events.map((e) => e.id)).toEqual(["EV-01", "EV-02", "EV-03", "EV-04", "EV-07", "EV-08"]);
    expect(json.events[3]).toMatchObject({ when: { precision: "year" }, sourceIds: ["S4"], uncertainty: expect.any(String) });
    expect(json.excluded).toEqual({ rejected: 1, pending: 3 });
    expect(json.conflicts.find((c) => c.id === "CF1")?.status).toBe("corrected");
  });

  it("Markdown shows precision, sources, and conflict decisions", () => {
    const md = toMarkdown(timeline, reviewed);
    expect(md).toContain("### 12 March 1891 — The library is founded by the town council");
    expect(md).toContain("- **Date precision:** Decade");
    expect(md).toContain('**Source:** S1 "The Riverside Library was founded on 12 March 1891 by the town council."');
    expect(md).toContain("(corrected)");
    expect(md).toContain("_Not included: 1 rejected and 3 unreviewed event(s)._");
  });

  it("TimelineAI import keeps precision and citations and never invents a start date", () => {
    const payload = toTimelineAiImport(timeline, reviewed)!;
    expect(payload.contractVersion).toBe("timelineai-events/1");
    const [founded, reading, moved] = payload.payload.events;
    expect(founded).toMatchObject({ startAt: "1891-03-12T00:00:00.000Z", temporalValue: { precision: "day" }, citations: [{ label: "S1" }] });
    expect(reading.startAt).toBeUndefined();
    expect(reading.temporalValue).toMatchObject({ precision: "season", season: "spring", year: 1893 });
    expect(moved.displayDate).toBe("the 1920s");
    expect(toTimelineAiImport(timeline, apply(...start.events.map((e) => ({ type: "set-status" as const, id: e.id, status: "rejected" as const }))))).toBeNull();
  });
});

describe("TimelineEditor", () => {
  const html = renderToStaticMarkup(<TimelineEditor timeline={timeline} origin="fixture" />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("leads with the notice and a status summary", () => {
    expect(text).toContain("Each date keeps the precision your text gives it.");
    expect(text).toContain("4 accepted · 6 need a decision · 3 conflicts not reviewed");
  });

  it("shows each conflict with a labelled decision group", () => {
    expect(text).toContain("Conflicts to review (3)");
    expect((html.match(/type="radio"/g) ?? []).length).toBe(9);
    expect(text).toContain("Decision for CF1: not reviewed");
    expect(text).toContain("Keep both claims: leave it unresolved on purpose");
  });

  it("shows precision, source quote, basis, and uncertainty on events", () => {
    expect(text).toContain("the spring of 1893 Season");
    expect(html).toMatch(/<blockquote[^>]*><a href="#[^"]+-src-S1">S1<\/a> The Riverside Library was founded/);
    expect(text).toContain("Uncited inference");
    expect(text).toContain("Uncertainty: The text doesn");
  });

  it("gives every event named accept/reject/edit/move controls with pressed state", () => {
    expect(text).toContain("Accept EV-01");
    expect(text).toContain("Reject EV-01");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Accept<span[^>]*> EV-01/);
    expect(text).toContain("Move down EV-01");
  });

  it("previews non-rejected events and offers the TimelineAI file", () => {
    expect(text).toContain("Preview");
    expect(text).toContain("Not published anywhere.");
    expect(text).toContain("timelineai-events/1");
    expect((text.match(/Download JSON/g) ?? []).length).toBe(2);
  });
});

describe("TimelineWorkbench", () => {
  const tool = toolCatalogue.find((t) => t.slug === "text-to-cited-timeline")!;
  const page = renderToStaticMarkup(<TimelineWorkbench tool={tool} />);

  it("renders the labelled text input and the optional details", () => {
    expect(page).toMatch(/<label for="([^"]+)">Text with dated events<\/label><textarea id="\1"/);
    expect(page).toMatch(/<label for="[^"]+">Level of detail<\/label>/);
    expect(page).toContain("A focus, not a filter");
    expect(page).toContain("0 / 12,000 characters");
  });
});
