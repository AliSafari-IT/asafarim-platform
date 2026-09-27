import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseHandoff } from "@asafarim/tool-handoff";
import { ToolHandoff } from "../../components/tools/ToolHandoff";
import { actionPlanExampleOutput } from "../../content/tool-fixtures/notes-to-action-plan";
import { testPlanExampleOutput } from "../../content/tool-fixtures/requirements-to-test-plan";
import { timelineExampleOutput } from "../../content/tool-fixtures/text-to-cited-timeline";
import { initialReview } from "./action-plan/plan-state";
import { actionPlanHandoff, testPlanHandoff, timelineHandoff } from "./handoff";
import { initialTimelineReview } from "./timeline/review";

const now = new Date("2026-09-27T12:00:00Z");

describe("handoff files built from the review", () => {
  it("test plan → Testora: only the selected scenarios, with their evidence or assumption", () => {
    const selected = testPlanExampleOutput.scenarios.filter((s) => ["TC-01", "TC-08"].includes(s.id)).map((s) => ({ ...s, origin: "edited" as const }));
    const envelope = testPlanHandoff(testPlanExampleOutput, selected, now)!;
    const parsed = parseHandoff(JSON.stringify(envelope), "testora", now);
    expect(parsed.ok).toBe(true);
    expect(envelope.payload.scenarios.map((s) => [s.ref, s.basis])).toEqual([
      ["TC-01", "extracted"],
      ["TC-08", "inferred"],
    ]);
    expect(envelope.payload.scenarios[0].evidence[0]).toMatch(/registered user/);
    expect(envelope.source).toEqual({ app: "web", tool: "requirements-to-test-plan", toolVersion: "1.0.0", schemaVersion: "test-plan/1" });
    expect(testPlanHandoff(testPlanExampleOutput, [], now)).toBeNull();
  });

  it("action plan → TasksAI: selected tasks, links only between them, never an assignee or due date", () => {
    const review = { ...initialReview(actionPlanExampleOutput, "example"), selected: ["T1", "T4", "T6"] };
    const envelope = actionPlanHandoff(actionPlanExampleOutput, review, now)!;
    expect(parseHandoff(JSON.stringify(envelope), "tasksai", now).ok).toBe(true);
    expect(envelope.payload.tasks.map((t) => [t.ref, t.waitsFor])).toEqual([
      ["T1", []],
      ["T4", ["T1"]],
      ["T6", ["T1"]],
    ]);
    // Names may appear in quoted evidence (that's the notes' own text), but never as an owner.
    expect(JSON.stringify(envelope)).not.toMatch(/"(?:assignee|owner|dueDate|deadline)"/);
    expect(envelope.payload.tasks.map((t) => t.title).join(" ")).not.toMatch(/Sam|Priya|Ahmed/);
    expect(actionPlanHandoff(actionPlanExampleOutput, { ...review, selected: [] }, now)).toBeNull();
  });

  it("timeline → TimelineAI: accepted events in TimelineAI's own contract", () => {
    const review = initialTimelineReview(timelineExampleOutput, "example");
    const envelope = timelineHandoff(timelineExampleOutput, review, now)!;
    expect(parseHandoff(JSON.stringify(envelope), "timelineai", now).ok).toBe(true);
    expect(envelope.payload.events).toHaveLength(review.events.filter((e) => e.status === "accepted").length);
    expect(envelope.payload.events[1].temporalValue).toMatchObject({ precision: "season" });
  });

  it("the continue link carries no content and names the destination", () => {
    const html = renderToStaticMarkup(<ToolHandoff destination="tasksai" what="tasks" build={() => null} />);
    expect(html).toMatch(/href="http:\/\/localhost:\d+\/import\/workbench"/);
    expect(html).toContain("Download for TasksAI");
    expect(html).not.toMatch(/\?/);
  });
});
