import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../content/tools";
import { actionPlanExampleOutput as plan } from "../../../content/tool-fixtures/notes-to-action-plan";
import { ActionPlanEditor } from "./ActionPlanEditor";
import { ActionPlanWorkbench } from "./ActionPlanWorkbench";
import { EXPORT_NOTICE, exportSelection, toExportJson, toMarkdown } from "./export";
import { addDependencyError, applyTaskEdit, draftFrom, initialReview, reviewReducer, type PlanReviewState, type ReviewAction } from "./plan-state";
import { actionPlanSchema, BASIS_LABELS } from "./schema";

const start = initialReview(plan, "example");
const apply = (...actions: ReviewAction[]) => actions.reduce<PlanReviewState>(reviewReducer, start);

describe("review state", () => {
  it("removing a task removes its dependency links and selection, and undo restores all of it", () => {
    const touching = plan.dependencies.filter((d) => d.from === "T6" || d.to === "T6").length;
    const removed = apply({ type: "remove-task", id: "T6" });
    expect(removed.tasks.some((t) => t.id === "T6")).toBe(false);
    expect(removed.dependencies).toHaveLength(plan.dependencies.length - touching);
    expect(removed.dependencies.every((d) => d.from !== "T6" && d.to !== "T6")).toBe(true);
    expect(removed.selected).not.toContain("T6");

    const restored = reviewReducer(removed, { type: "undo" });
    expect(restored.tasks).toEqual(start.tasks);
    expect(restored.dependencies).toEqual(start.dependencies);
    expect(restored.selected).toEqual(start.selected);
    expect(restored.history).toHaveLength(0);
  });

  it("undoes several steps in order and ignores undo with no history", () => {
    const s = apply({ type: "move", id: "T2", by: -1 }, { type: "remove-dependency", id: "E1" });
    expect(s.tasks.map((t) => t.id).slice(0, 2)).toEqual(["T2", "T1"]);
    const once = reviewReducer(s, { type: "undo" });
    expect(once.dependencies.some((d) => d.id === "E1")).toBe(true);
    expect(once.tasks.map((t) => t.id).slice(0, 2)).toEqual(["T2", "T1"]);
    expect(reviewReducer(reviewReducer(once, { type: "undo" }), { type: "undo" }).tasks).toEqual(start.tasks);
  });

  it("does not move past either end", () => {
    expect(apply({ type: "move", id: "T1", by: -1 })).toBe(start);
    expect(apply({ type: "move", id: "T10", by: 1 })).toBe(start);
  });

  it("adds a dependency as a labelled user suggestion, refusing cycles, duplicates, and self-links", () => {
    const s = apply({ type: "add-dependency", from: "T4", to: "T6" });
    expect(s.dependencies.at(-1)).toMatchObject({ id: "E9", from: "T4", to: "T6", origin: "added", basis: "recommendation" });
    expect(addDependencyError(start, "T9", "T7")).toMatch(/circular chain/);
    expect(addDependencyError(start, "T1", "T4")).toMatch(/already waits/);
    expect(addDependencyError(start, "T1", "T1")).toMatch(/itself/);
    expect(apply({ type: "add-dependency", from: "T9", to: "T7" })).toBe(start);
  });

  it("edits keep the basis and evidence, mark the task edited, and validate effort", () => {
    const t3 = start.tasks.find((t) => t.id === "T3")!;
    const ok = applyTaskEdit(t3, { ...draftFrom(t3), title: "Restore images after import", effortLow: "2", effortHigh: "1" });
    expect(ok.ok).toBe(false);
    const edited = applyTaskEdit(t3, { ...draftFrom(t3), title: "Restore images after import", effortLow: "", effortHigh: "" });
    expect(edited).toMatchObject({ ok: true, task: { id: "T3", basis: "inference", sourceIds: ["N5"], origin: "edited", title: "Restore images after import" } });
    expect(edited.ok && edited.task.effort).toBeUndefined();
    expect(applyTaskEdit(t3, { ...draftFrom(t3), rationale: " " })).toEqual({ ok: false, errors: ["Inferred tasks need their assumption."] });
  });
});

describe("export", () => {
  it("exports the selection in the user's order, drops links to unselected tasks, and says so", () => {
    const s = apply({ type: "move", id: "T4", by: -1 }, { type: "toggle", id: "T6" });
    const { tasks, dependencies, milestones, omitted } = exportSelection(plan, s);
    expect(tasks.map((t) => t.id).slice(0, 4)).toEqual(["T1", "T2", "T4", "T3"]);
    expect(dependencies.some((d) => d.from === "T6" || d.to === "T6")).toBe(false);
    expect(omitted).toContain("E3 (T3 → T6) left out: T6 isn't in this export.");
    expect(omitted).toContain("M2 (Switched with no broken links) exported without T6.");
    expect(milestones[1].taskIds).not.toContain("T6");
  });

  it("JSON is versioned, carries labels and origins, and its plan is schema-valid", () => {
    const json = toExportJson(plan, start, new Date("2026-09-27T12:00:00Z"));
    expect(json).toMatchObject({ schemaVersion: "action-plan/1", exportedAt: "2026-09-27T12:00:00.000Z", notice: EXPORT_NOTICE, omitted: [] });
    expect(json.plan.tasks[2]).toMatchObject({ basis: "inference", rationale: expect.any(String), origin: "example" });
    const { tasks, dependencies, ...rest } = json.plan;
    const strip = <T extends { origin: unknown }>({ origin: _o, ...x }: T) => x;
    expect(actionPlanSchema.safeParse({ ...rest, tasks: tasks.map(strip), dependencies: dependencies.map(strip) }).success).toBe(true);
  });

  it("Markdown keeps every provenance label and escapes pasted markup", () => {
    const md = toMarkdown(plan, start);
    for (const basis of ["fact", "inference", "recommendation", "constraint"] as const) expect(md).toContain(`_${BASIS_LABELS[basis].label}:_`);
    expect(md).toContain("**Waits for:** T3, T5, T1");
    expect(md).toContain("## Milestones (checkpoints, not dates)");
    const hostile = toMarkdown({ ...plan, title: "[x](javascript:alert(1)) <img>" }, start);
    expect(hostile).toContain("\\[x\\]\\(javascript:alert\\(1\\)\\) \\<img\\>");
  });
});

describe("ActionPlanEditor", () => {
  const html = renderToStaticMarkup(<ActionPlanEditor plan={plan} origin="fixture" />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("leads with the review notice: nobody assigned, no deadlines", () => {
    expect(html.indexOf("A draft for you to review.")).toBeLessThan(html.indexOf("Tasks ("));
    expect(text).toContain("Nobody has been assigned, no deadlines were added");
  });

  it("labels every item with its basis and quotes the notes", () => {
    for (const basis of ["fact", "inference", "recommendation", "constraint"] as const) expect(text).toContain(BASIS_LABELS[basis].label);
    expect(html).toMatch(/<blockquote><a href="#[^"]+-src-N6">N6<\/a> Need an inventory of articles and which ones are outdated\.<\/blockquote>/);
    expect(text).toContain("Assumption: The notes say the export tool drops images");
  });

  it("gives every task a labelled checkbox and named move/edit/remove buttons, and an undo control", () => {
    expect((html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).length).toBe(plan.tasks.length);
    expect(text).toContain("Include T1 in export");
    for (const verb of ["Move up", "Move down", "Edit", "Remove"]) expect(text).toContain(`${verb} T2`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Undo<\/button>/);
  });

  it("shows dependencies, milestones as checkpoints, risks, decisions, and open questions", () => {
    expect(text).toContain("Waits for");
    expect(text).toContain("Remove link E1: T4 waits for T1");
    expect(text).toContain("Checkpoints made of tasks, not dates.");
    expect(text).toContain("Risks (3)");
    expect(text).toContain("Decisions already made (2)");
    expect(text).toContain("Open questions (3)");
    expect(html).toMatch(/<label for="[^"]+-edge-to">This task…<\/label>/);
  });

  it("offers export of the selection, created in the browser", () => {
    expect(text).toContain("Tasks (10 of 10 selected)");
    expect(text).toContain("Download Markdown");
    expect(text).toContain("nothing is uploaded");
  });
});

describe("ActionPlanWorkbench", () => {
  const tool = toolCatalogue.find((t) => t.slug === "notes-to-action-plan")!;
  const page = renderToStaticMarkup(<ActionPlanWorkbench tool={tool} />);

  it("renders the labelled notes input and optional details", () => {
    expect(page).toMatch(/<label for="([^"]+)">Notes, brief, or idea dump<\/label><textarea id="\1"/);
    expect(page).toContain("Optional details");
    expect(page).toMatch(/<label for="[^"]+">Planning depth<\/label>/);
    expect(page).toContain("The plan never assigns tasks to anyone.");
    expect(page).toContain("0 / 10,000 characters");
  });
});
