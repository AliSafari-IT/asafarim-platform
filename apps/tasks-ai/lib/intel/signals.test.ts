import { describe, expect, it } from "vitest";
import { detectSignals, type WorkspaceSnapshot } from "./signals";

const NOW = "2026-09-06T12:00:00Z";
const task = (o: Partial<WorkspaceSnapshot["tasks"][number]> & { id: string }): WorkspaceSnapshot["tasks"][number] => ({
  id: o.id,
  title: o.title ?? o.id,
  dueDate: o.dueDate ?? null,
  completedAt: o.completedAt ?? null,
  estimate: o.estimate ?? null,
  updatedAt: o.updatedAt ?? NOW,
  assigneeId: o.assigneeId ?? null,
  blocks: o.blocks ?? [],
  blockedBy: o.blockedBy ?? [],
});

describe("detectSignals", () => {
  it("flags an overdue task as high due-date risk with evidence", () => {
    const snap: WorkspaceSnapshot = {
      now: NOW,
      memberLabels: {},
      tasks: [task({ id: "a", dueDate: "2026-09-01T00:00:00Z", estimate: 2 })],
    };
    const s = detectSignals(snap).find((x) => x.type === "due_date_risk")!;
    expect(s.severity).toBe("high");
    expect(s.evidence[0]).toMatchObject({ kind: "task", id: "a" });
    expect(s.limitations).toBeTruthy();
    expect(s.alternatives.length).toBeGreaterThan(0);
  });

  it("flags a blocker chain when a task blocks >=2 open tasks", () => {
    const snap: WorkspaceSnapshot = {
      now: NOW,
      memberLabels: {},
      tasks: [
        task({ id: "root", blocks: ["d1", "d2"] }),
        task({ id: "d1", dueDate: "2026-09-08T00:00:00Z" }),
        task({ id: "d2" }),
      ],
    };
    const s = detectSignals(snap).find((x) => x.type === "blocker_chain")!;
    expect(s).toBeTruthy();
    expect(s.severity).toBe("high"); // d1 due within 5 days
  });

  it("flags stale assigned work after 14 days of silence", () => {
    const snap: WorkspaceSnapshot = {
      now: NOW,
      memberLabels: { m1: "member:m1" },
      tasks: [task({ id: "a", assigneeId: "m1", updatedAt: "2026-08-01T00:00:00Z" })],
    };
    expect(detectSignals(snap).some((x) => x.type === "stale_work")).toBe(true);
  });

  it("workload imbalance evidence points at tasks, never names a score", () => {
    const many = Array.from({ length: 8 }, (_, i) => task({ id: `x${i}`, assigneeId: "heavy" }));
    const few = [task({ id: "y1", assigneeId: "a" }), task({ id: "y2", assigneeId: "b" })];
    const snap: WorkspaceSnapshot = { now: NOW, memberLabels: {}, tasks: [...many, ...few] };
    const s = detectSignals(snap).find((x) => x.type === "workload_imbalance")!;
    expect(s).toBeTruthy();
    expect(s.evidence.every((e) => e.kind === "task")).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/productivity|performance|score/i);
  });

  it("is deterministic for the same snapshot", () => {
    const snap: WorkspaceSnapshot = {
      now: NOW,
      memberLabels: {},
      tasks: [task({ id: "a", dueDate: "2026-09-01T00:00:00Z" })],
    };
    expect(JSON.stringify(detectSignals(snap))).toBe(JSON.stringify(detectSignals(snap)));
  });
});
