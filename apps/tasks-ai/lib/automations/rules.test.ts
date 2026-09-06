import { describe, expect, it } from "vitest";
import { dryRun, evalCondition, matchesConditions, matchesTrigger, type TriggerEvent } from "./rules";

const event: TriggerEvent = {
  name: "task.status_changed",
  workspaceId: "w1",
  data: { id: "t1", title: "Ship it", statusId: "done", assigneeId: null, priority: 3 },
  changed: { statusId: { from: "doing", to: "done" } },
};

describe("evalCondition", () => {
  it("eq / neq / contains / gt / lt", () => {
    expect(evalCondition({ field: "statusId", op: "eq", value: "done" }, event)).toBe(true);
    expect(evalCondition({ field: "statusId", op: "neq", value: "done" }, event)).toBe(false);
    expect(evalCondition({ field: "title", op: "contains", value: "Ship" }, event)).toBe(true);
    expect(evalCondition({ field: "priority", op: "gt", value: 2 }, event)).toBe(true);
    expect(evalCondition({ field: "priority", op: "lt", value: 2 }, event)).toBe(false);
  });
  it("is_set / is_unset", () => {
    expect(evalCondition({ field: "assigneeId", op: "is_unset" }, event)).toBe(true);
    expect(evalCondition({ field: "statusId", op: "is_set" }, event)).toBe(true);
  });
  it("changed_to / changed_from", () => {
    expect(evalCondition({ field: "statusId", op: "changed_to", value: "done" }, event)).toBe(true);
    expect(evalCondition({ field: "statusId", op: "changed_from", value: "doing" }, event)).toBe(true);
    expect(evalCondition({ field: "statusId", op: "changed_to", value: "doing" }, event)).toBe(false);
  });
});

describe("matchesTrigger / matchesConditions", () => {
  it("matches on event name + filters", () => {
    expect(matchesTrigger({ trigger: { event: "task.status_changed", filters: [] } }, event)).toBe(true);
    expect(matchesTrigger({ trigger: { event: "task.created", filters: [] } }, event)).toBe(false);
    expect(
      matchesTrigger({ trigger: { event: "task.status_changed", filters: [{ field: "statusId", op: "eq", value: "done" }] } }, event),
    ).toBe(true);
  });
  it("ANDs conditions", () => {
    expect(matchesConditions([{ field: "title", op: "contains", value: "Ship" }, { field: "priority", op: "gt", value: 2 }], event)).toBe(true);
    expect(matchesConditions([{ field: "priority", op: "lt", value: 2 }], event)).toBe(false);
  });
});

describe("dryRun", () => {
  const rule = {
    name: "auto-close",
    trigger: { event: "task.status_changed", filters: [{ field: "statusId", op: "changed_to" as const, value: "done" }] },
    conditions: [{ field: "title", op: "contains" as const, value: "Ship" }],
    actions: [{ type: "comment" as const, body: "Nice." }],
    maxRunsPerHour: 60,
  };

  it("reports triggered + conditionsMet + planned actions without executing", () => {
    const r = dryRun(rule, event);
    expect(r).toMatchObject({ triggered: true, conditionsMet: true, wouldRun: true });
    expect(r.plannedActions).toHaveLength(1);
  });

  it("flags loop risk when an action emits the trigger event", () => {
    const looped = { ...rule, actions: [{ type: "set_status" as const, statusId: "x" }] };
    expect(dryRun(looped, event).loopRisk).toBe(true);
  });

  it("wouldRun is false when conditions fail", () => {
    const r = dryRun({ ...rule, conditions: [{ field: "priority", op: "lt", value: 1 }] }, event);
    expect(r.triggered).toBe(true);
    expect(r.wouldRun).toBe(false);
  });
});
