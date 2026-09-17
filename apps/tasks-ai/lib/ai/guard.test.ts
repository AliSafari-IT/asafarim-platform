import { describe, expect, it } from "vitest";
import { GuardError, guardDraft } from "./guard";
import { TARGET_TASK_REF, operationSchema } from "./types";

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

  // ── retrieved-context citations (issue #232) ────────────────────────────

  const sourced = (source: string) => ({
    summary: "grounded on retrieved context",
    operations: [
      {
        op: "create_task",
        ref: "t1",
        fields: { title: "Follow-up" },
        confidence: 0.6,
        citations: [{ span: null, assumption: false, source }],
      },
    ],
    openQuestions: [],
  });

  it("counts a citation whose source was actually retrieved as grounded", () => {
    const r = guardDraft(sourced("task:abc123"), 50, {
      retrievedIds: new Set(["task:abc123"]),
    });
    expect(r.groundedRatio).toBe(1);
  });

  it("does not count a hallucinated source id as grounded", () => {
    const r = guardDraft(sourced("task:invented"), 50, {
      retrievedIds: new Set(["task:abc123"]),
    });
    expect(r.groundedRatio).toBe(0);
  });

  it("does not count a source id as grounded when nothing was retrieved", () => {
    const r = guardDraft(sourced("task:abc123"), 50);
    expect(r.groundedRatio).toBe(0);
  });

  it("still passes the guard (not rejected) for a hallucinated source — treated as ungrounded, not fatal", () => {
    expect(() =>
      guardDraft(sourced("task:invented"), 50, { retrievedIds: new Set(["task:abc123"]) }),
    ).not.toThrow();
  });

  // ── dedup candidate-ref links (issue #234) ──────────────────────────────

  const dedupLink = (toRef: string) => ({
    summary: "possible duplicate",
    operations: [
      {
        op: "link_tasks",
        fromRef: TARGET_TASK_REF,
        toRef,
        kind: "duplicates",
        confidence: 0.8,
        citations: [{ span: null, assumption: false, source: toRef }],
      },
    ],
    openQuestions: [],
  });

  it("accepts a duplicates link from the target task to a retrieved candidate", () => {
    const r = guardDraft(dedupLink("task:cand1"), 50, {
      hasTargetTask: true,
      retrievedIds: new Set(["task:cand1"]),
    });
    expect(r.operationCount).toBe(1);
    expect(r.groundedRatio).toBe(1);
  });

  it("rejects a link to a candidate id retrieval never returned — the isolation boundary", () => {
    // Stands in for a task from another project/workspace that should never
    // have reached the prompt: even if the model names it (hallucinated, or
    // a future retrieval regression), it must never resolve to a real link.
    expect(() =>
      guardDraft(dedupLink("task:leaked-other-workspace"), 50, {
        hasTargetTask: true,
        retrievedIds: new Set(["task:cand1"]),
      }),
    ).toThrow(/unknown ref/);
  });

  it("rejects a candidate-shaped ref with no retrievedIds at all", () => {
    expect(() => guardDraft(dedupLink("task:cand1"), 50, { hasTargetTask: true })).toThrow(
      /unknown ref/,
    );
  });

  it("refuses a create_task op claiming a ref in the reserved candidate namespace", () => {
    const bad = {
      summary: "x",
      operations: [
        { op: "create_task", ref: "task:sneaky", fields: { title: "A" }, confidence: 0.5, citations: [] },
      ],
      openQuestions: [],
    };
    expect(() => guardDraft(bad, 50)).toThrow(/reserved candidate-ref namespace/);
  });

  // ── widened allowlist (issue #235) ──────────────────────────────────────

  const setLabels = (taskId: string, add: string[] = ["lbl_1"], remove: string[] = []) => ({
    summary: "labels",
    operations: [
      {
        op: "set_labels",
        taskId,
        fields: { add, remove },
        confidence: 0.6,
        citations: [{ span: null, assumption: true }],
      },
    ],
    openQuestions: [],
  });

  const suggestStatus = (taskId: string) => ({
    summary: "status",
    operations: [
      {
        op: "suggest_status",
        taskId,
        statusId: "sts_1",
        confidence: 0.5,
        citations: [{ span: null, assumption: true }],
      },
    ],
    openQuestions: [],
  });

  const suggestDueDate = (taskId: string, dueDate = "2026-12-01T00:00:00.000Z") => ({
    summary: "due date",
    operations: [
      {
        op: "suggest_due_date",
        taskId,
        dueDate,
        confidence: 0.5,
        citations: [{ span: null, assumption: true }],
      },
    ],
    openQuestions: [],
  });

  const setDependency = (fromRef: string, toRef: string, kind: "blocks" | "blocked_by" = "blocks") => ({
    summary: "dependency",
    operations: [
      {
        op: "set_dependency",
        fromRef,
        toRef,
        kind,
        confidence: 0.5,
        citations: [{ span: null, assumption: true }],
      },
    ],
    openQuestions: [],
  });

  for (const [name, factory] of [
    ["set_labels", setLabels],
    ["suggest_status", suggestStatus],
    ["suggest_due_date", suggestDueDate],
  ] as const) {
    it(`accepts a ${name} op addressing the target task`, () => {
      expect(() => guardDraft(factory(TARGET_TASK_REF), 50, { hasTargetTask: true })).not.toThrow();
    });

    it(`refuses a ${name} op when no task was targeted`, () => {
      expect(() => guardDraft(factory(TARGET_TASK_REF), 50)).toThrow(/without a target task/);
    });

    it(`refuses a ${name} op against an invented id even when a task is targeted`, () => {
      expect(() => guardDraft(factory("tsk_guessed"), 50, { hasTargetTask: true })).toThrow(
        /invented task id/,
      );
    });
  }

  it("accepts a blocked_by dependency between the target task and a retrieved candidate", () => {
    const r = guardDraft(setDependency(TARGET_TASK_REF, "task:cand1", "blocked_by"), 50, {
      hasTargetTask: true,
      retrievedIds: new Set(["task:cand1"]),
    });
    expect(r.operationCount).toBe(1);
  });

  it("rejects a set_dependency link to a candidate id retrieval never returned", () => {
    expect(() =>
      guardDraft(setDependency(TARGET_TASK_REF, "task:leaked", "blocks"), 50, {
        hasTargetTask: true,
        retrievedIds: new Set(["task:cand1"]),
      }),
    ).toThrow(/unknown ref/);
  });

  // ── hard prohibitions still hold (issue #235 acceptance criteria) ───────
  // Schema-level: none of the widened ops has a field for an assignee, a
  // real/committed date or status, a message, or a delete — so prompt
  // injection cannot produce one; it is not representable, not merely
  // filtered.

  it("rejects a set_labels op smuggling an assignee-like field", () => {
    const bad = {
      op: "set_labels",
      taskId: TARGET_TASK_REF,
      fields: { add: ["lbl_1"], assigneeId: "usr_1" },
      confidence: 0.5,
      citations: [],
    };
    expect(operationSchema.safeParse(bad).success).toBe(false);
  });

  it("never applies a `status` field beside suggest_status's statusId — there is no committed-status field to smuggle into", () => {
    // suggest_status has no field but `statusId`, and that always resolves
    // to the *suggested* column, never Task.statusId (proposals.ts). A
    // sibling key riding along in the raw JSON is stripped like any other
    // unmodeled field, so there is nothing for downstream code to read.
    const parsed = operationSchema.parse({
      op: "suggest_status",
      taskId: TARGET_TASK_REF,
      statusId: "sts_1",
      status: "done",
      confidence: 0.5,
      citations: [],
    });
    expect(parsed).not.toHaveProperty("status");
  });

  it("never applies a committed-dueDate-shaped field beside suggest_due_date's dueDate", () => {
    const parsed = operationSchema.parse({
      op: "suggest_due_date",
      taskId: TARGET_TASK_REF,
      dueDate: "2026-12-01T00:00:00.000Z",
      committedDueDate: "2026-12-01T00:00:00.000Z",
      confidence: 0.5,
      citations: [],
    });
    expect(parsed).not.toHaveProperty("committedDueDate");
  });

  it("rejects a delete-shaped op outright — delete is not a representable op type", () => {
    const bad = { op: "delete_task", taskId: TARGET_TASK_REF, confidence: 0.5, citations: [] };
    expect(operationSchema.safeParse(bad).success).toBe(false);
  });

  it("never applies a notify/message-shaped field on set_dependency", () => {
    const parsed = operationSchema.parse({
      op: "set_dependency",
      fromRef: TARGET_TASK_REF,
      toRef: "t1",
      kind: "blocks",
      notify: true,
      confidence: 0.5,
      citations: [],
    });
    expect(parsed).not.toHaveProperty("notify");
  });

  it("rejects an assignee-shaped field nested in create_task's fields (still no such field exists)", () => {
    const bad = {
      op: "create_task",
      ref: "t1",
      fields: { title: "A", assigneeId: "usr_1" },
      confidence: 0.5,
      citations: [],
    };
    expect(operationSchema.safeParse(bad).success).toBe(false);
  });
});
