import { describe, expect, it } from "vitest";
import { GuardError, guardDraft } from "./guard";
import { TARGET_TASK_REF } from "./types";

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

  // ── the target task (PR #377 review) ───────────────────────────────────

  const update = (taskId: string) => ({
    summary: "criteria",
    operations: [
      {
        op: "update_task",
        taskId,
        fields: { description: "Acceptance criteria:\n- [ ] works" },
        confidence: 0.5,
        citations: [{ span: null, assumption: true }],
      },
    ],
    openQuestions: [],
  });

  it("accepts a parent and an update naming the targeted existing task", () => {
    const draft = {
      summary: "subtasks",
      operations: [
        {
          op: "create_task",
          ref: "t1",
          fields: { title: "Step", parentRef: TARGET_TASK_REF },
          confidence: 0.6,
          citations: [{ span: [0, 1], assumption: false }],
        },
        update(TARGET_TASK_REF).operations[0],
      ],
      openQuestions: [],
    };
    expect(() => guardDraft(draft, 50, { hasTargetTask: true })).not.toThrow();
  });

  it("refuses an update when no task was targeted: nothing it names exists", () => {
    expect(() => guardDraft(update(TARGET_TASK_REF), 50)).toThrow(/without a target task/);
    expect(() => guardDraft(update("tsk_guessed"), 50)).toThrow(/without a target task/);
  });

  it("refuses an update against an invented id even when a task is targeted", () => {
    expect(() => guardDraft(update("tsk_guessed"), 50, { hasTargetTask: true })).toThrow(
      /invented task id/,
    );
  });

  it("refuses a parentRef on the target task when there is no target task", () => {
    const bad = {
      ...good,
      operations: [
        {
          op: "create_task",
          ref: "t1",
          fields: { title: "Step", parentRef: TARGET_TASK_REF },
          confidence: 0.6,
          citations: [],
        },
      ],
    };
    expect(() => guardDraft(bad, 50)).toThrow(/parentRef/);
  });

  it("refuses a draft that tries to create the reserved target ref", () => {
    const bad = {
      ...good,
      operations: [
        { op: "create_task", ref: TARGET_TASK_REF, fields: { title: "A" }, confidence: 0.5, citations: [] },
      ],
    };
    expect(() => guardDraft(bad, 50, { hasTargetTask: true })).toThrow(/reserved/);
  });
});
