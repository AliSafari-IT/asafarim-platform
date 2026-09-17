import { describe, expect, it } from "vitest";
import { duplicateHints, editDistance, groupOperations } from "./diff";
import type { Operation } from "./types";

const create = (ref: string, title: string, parentRef?: string): Operation => ({
  op: "create_task",
  ref,
  fields: { title, ...(parentRef ? { parentRef } : {}) },
  confidence: 0.7,
  citations: [{ span: [0, 1], assumption: false }],
});

describe("groupOperations", () => {
  it("groups by create/update/link and marks grounded items", () => {
    const ops: Operation[] = [
      create("t1", "A"),
      { op: "update_task", taskId: "x", fields: { title: "B" }, confidence: 0.5, citations: [{ span: null, assumption: true }] },
      { op: "link_tasks", fromRef: "t1", toRef: "t2", kind: "blocks", confidence: 0.4, citations: [] },
    ];
    const groups = groupOperations(ops);
    expect(groups.map((g) => g.kind)).toEqual(["create", "update", "link"]);
    expect(groups[0].items[0].grounded).toBe(true);
    expect(groups[1].items[0].grounded).toBe(false);
  });

  // ── widened allowlist (issue #235) ──────────────────────────────────────

  it("buckets set_labels/suggest_status/suggest_due_date with update, and set_dependency with link", () => {
    const ops: Operation[] = [
      { op: "set_labels", taskId: "x", fields: { add: ["lbl_1"], remove: [] }, confidence: 0.5, citations: [] },
      { op: "suggest_status", taskId: "x", statusId: "sts_1", confidence: 0.5, citations: [] },
      { op: "suggest_due_date", taskId: "x", dueDate: "2026-12-01T00:00:00.000Z", confidence: 0.5, citations: [] },
      { op: "set_dependency", fromRef: "t1", toRef: "t2", kind: "blocked_by", confidence: 0.5, citations: [] },
    ];
    const groups = groupOperations(ops);
    expect(groups.map((g) => g.kind)).toEqual(["update", "link"]);
    expect(groups.find((g) => g.kind === "update")?.items).toHaveLength(3);
    expect(groups.find((g) => g.kind === "link")?.items).toHaveLength(1);
  });
});

describe("editDistance", () => {
  it("is 0 when applied verbatim", () => {
    const ops = [create("t1", "A"), create("t2", "B")];
    expect(editDistance(ops, ops)).toBe(0);
  });
  it("rises as the user edits / drops / adds", () => {
    const gen = [create("t1", "A"), create("t2", "B"), create("t3", "C")];
    const applied = [create("t1", "A"), create("t2", "B renamed")];
    expect(editDistance(gen, applied)).toBeGreaterThan(0);
    expect(editDistance(gen, applied)).toBeLessThanOrEqual(1);
  });
  it("is 1 when nothing generated was kept", () => {
    expect(editDistance([create("t1", "A")], [create("z", "totally different")])).toBe(1);
  });

  it("handles the widened op types (issue #235) without throwing", () => {
    const ops: Operation[] = [
      { op: "set_labels", taskId: "x", fields: { add: ["lbl_1"], remove: [] }, confidence: 0.5, citations: [] },
      { op: "suggest_status", taskId: "x", statusId: "sts_1", confidence: 0.5, citations: [] },
      { op: "suggest_due_date", taskId: "x", dueDate: "2026-12-01T00:00:00.000Z", confidence: 0.5, citations: [] },
      { op: "set_dependency", fromRef: "t1", toRef: "t2", kind: "blocked_by", confidence: 0.5, citations: [] },
    ];
    expect(editDistance(ops, ops)).toBe(0);
    expect(editDistance(ops, [])).toBe(1);
  });
});

describe("duplicateHints", () => {
  it("flags near-identical create titles", () => {
    const ops = [create("t1", "Write the release notes"), create("t2", "write release notes"), create("t3", "QA on mobile")];
    const hints = duplicateHints(ops);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ a: 0, b: 1 });
  });
});
