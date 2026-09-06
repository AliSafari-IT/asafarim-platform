import { describe, expect, it } from "vitest";
import { rankTasks, RULE_VERSION, scoreTask, type FocusInput } from "./scoring";

const base: FocusInput = {
  taskId: "t1",
  title: "x",
  dueDate: null,
  startDate: null,
  completedAt: null,
  estimate: null,
  blocks: 0,
  blockedBy: 0,
  updatedAt: new Date("2026-09-06T00:00:00Z").toISOString(),
  isAssignedToViewer: true,
  viewerOpenCount: 3,
};
const now = new Date("2026-09-06T12:00:00Z");

describe("scoreTask", () => {
  it("score equals the sum of factor points and carries the rule version", () => {
    const s = scoreTask(base, now);
    expect(s.score).toBe(s.factors.reduce((a, f) => a + f.points, 0));
    expect(s.ruleVersion).toBe(RULE_VERSION);
    expect(s.factors.map((f) => f.factor).sort()).toEqual(
      ["commitment", "freshness", "impact", "readiness", "urgency", "workload"],
    );
  });

  it("an overdue task with downstream blockers outranks a far-future one", () => {
    const overdue = scoreTask(
      { ...base, taskId: "a", dueDate: new Date("2026-09-01").toISOString(), blocks: 3 },
      now,
    );
    const later = scoreTask(
      { ...base, taskId: "b", dueDate: new Date("2026-10-01").toISOString() },
      now,
    );
    expect(overdue.score).toBeGreaterThan(later.score);
    expect(overdue.factors.find((f) => f.factor === "urgency")!.because).toMatch(/overdue/);
  });

  it("a user weight of 0 zeroes that factor's contribution", () => {
    const s = scoreTask({ ...base, blocks: 4 }, now, { impact: 0 });
    expect(s.factors.find((f) => f.factor === "impact")!.points).toBe(0);
  });

  it("workload dampens as the viewer's open count rises", () => {
    const light = scoreTask({ ...base, viewerOpenCount: 2 }, now).factors.find((f) => f.factor === "workload")!.points;
    const heavy = scoreTask({ ...base, viewerOpenCount: 20 }, now).factors.find((f) => f.factor === "workload")!.points;
    expect(light).toBeGreaterThan(heavy);
  });
});

describe("rankTasks", () => {
  it("is stable: equal scores keep a deterministic order across calls", () => {
    const inputs = ["z", "a", "m"].map((id) => ({ ...base, taskId: id }));
    const one = rankTasks(inputs, now).map((r) => r.taskId);
    const two = rankTasks([...inputs].reverse(), now).map((r) => r.taskId);
    expect(one).toEqual(two);
    expect(one).toEqual(["a", "m", "z"]);
  });
});
