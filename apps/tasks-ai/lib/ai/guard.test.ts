import { describe, expect, it } from "vitest";
import { GuardError, guardDraft } from "./guard";

const good = {
  summary: "two tasks",
  operations: [
    { op: "create_task", ref: "t1", fields: { title: "A" }, confidence: 0.7, citations: [{ span: [0, 1], assumption: false }] },
    { op: "create_task", ref: "t2", fields: { title: "B", parentRef: "t1" }, confidence: 0.7, citations: [{ span: [2, 3], assumption: false }] },
    { op: "link_tasks", fromRef: "t1", toRef: "t2", kind: "blocks", confidence: 0.5, citations: [{ span: null, assumption: true }] },
  ],
  openQuestions: [],
};

describe("guardDraft", () => {
  it("accepts a well-formed draft and computes groundedRatio", () => {
    const r = guardDraft(good, 50);
    expect(r.operationCount).toBe(3);
    expect(r.groundedRatio).toBeCloseTo(2 / 3, 5);
  });

  it("rejects when operations exceed the blast radius", () => {
    expect(() => guardDraft(good, 2)).toThrow(GuardError);
  });

  it("rejects a link to an unknown ref", () => {
    const bad = { ...good, operations: [good.operations[0], { ...good.operations[2], toRef: "nope" }] };
    expect(() => guardDraft(bad, 50)).toThrow(/unknown ref/);
  });

  it("rejects a parentRef with no matching create_task", () => {
    const bad = {
      ...good,
      operations: [{ op: "create_task", ref: "x", fields: { title: "A", parentRef: "ghost" }, confidence: 0.5, citations: [] }],
    };
    expect(() => guardDraft(bad, 50)).toThrow(/parentRef/);
  });

  it("rejects an operation type outside the allowlist (schema level)", () => {
    const bad = { ...good, operations: [{ op: "assign_task", taskId: "t", userId: "u" }] };
    expect(() => guardDraft(bad, 50)).toThrow();
  });
});
