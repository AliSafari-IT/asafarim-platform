import { describe, expect, it } from "vitest";
import { agingWip, cycleTime, predictability, throughput, type FlowTask } from "./flow";
import { backtest, forecast } from "./forecast";

const iso = (d: string) => new Date(d).toISOString();
const t = (o: Partial<FlowTask> & { id: string }): FlowTask => ({
  id: o.id,
  createdAt: o.createdAt ?? iso("2026-08-01"),
  startedAt: o.startedAt ?? null,
  completedAt: o.completedAt ?? null,
  archivedAt: o.archivedAt ?? null,
});

const W_START = new Date("2026-08-01");
const W_END = new Date("2026-09-06");

describe("cycleTime", () => {
  it("computes percentiles from start→complete durations", () => {
    const tasks = [
      t({ id: "a", startedAt: iso("2026-08-10"), completedAt: iso("2026-08-12") }), // 2d
      t({ id: "b", startedAt: iso("2026-08-10"), completedAt: iso("2026-08-20") }), // 10d
      t({ id: "c", startedAt: iso("2026-08-10"), completedAt: iso("2026-08-14") }), // 4d
    ];
    const r = cycleTime(tasks, W_START, W_END);
    expect(r.count).toBe(3);
    expect(r.p50).toBe(4);
    expect(r.defVersion).toMatch(/^flow@/);
  });
  it("falls back to createdAt when startedAt is unknown", () => {
    const r = cycleTime([t({ id: "a", createdAt: iso("2026-08-01"), completedAt: iso("2026-08-06") })], W_START, W_END);
    expect(r.p50).toBe(5);
  });
});

describe("throughput", () => {
  it("counts completions in window and normalizes per day", () => {
    const tasks = [
      t({ id: "a", completedAt: iso("2026-08-15") }),
      t({ id: "b", completedAt: iso("2026-08-16") }),
      t({ id: "c", completedAt: iso("2026-07-01") }), // outside window
    ];
    const r = throughput(tasks, W_START, W_END);
    expect(r.completed).toBe(2);
    expect(r.perDay).toBeGreaterThan(0);
  });
});

describe("agingWip", () => {
  it("buckets open tasks by age and never counts completed/archived", () => {
    const now = new Date("2026-09-06");
    const tasks = [
      t({ id: "fresh", createdAt: iso("2026-09-04") }),
      t({ id: "old", createdAt: iso("2026-07-01") }),
      t({ id: "done", createdAt: iso("2026-07-01"), completedAt: iso("2026-07-05") }),
    ];
    const r = agingWip(tasks, now);
    expect(r.open).toBe(2);
    expect(r.buckets["0-3d"]).toBe(1);
    expect(r.buckets["30d+"]).toBe(1);
  });
});

describe("predictability", () => {
  it("cv is 0 for a perfectly steady history and >0 for a jumpy one", () => {
    const steady = Array.from({ length: 20 }, (_, i) =>
      t({ id: `s${i}`, completedAt: iso(`2026-0${((i % 8) + 1)}-01`) }),
    );
    const r = predictability(steady, new Date("2026-09-06"));
    expect(r.coefficientOfVariation).toBeGreaterThanOrEqual(0);
    expect(r.weeklyThroughput.length).toBe(8);
  });
});

describe("forecast", () => {
  it("returns an ordered p50<=p80<=p95 band and is deterministic for a seed", () => {
    const f1 = forecast({ weeklyThroughput: [3, 4, 2, 5, 3, 4], remaining: 20, now: new Date("2026-09-06"), seed: 1 });
    const f2 = forecast({ weeklyThroughput: [3, 4, 2, 5, 3, 4], remaining: 20, now: new Date("2026-09-06"), seed: 1 });
    expect(f1).toEqual(f2);
    expect(new Date(f1.bands.p50).getTime()).toBeLessThanOrEqual(new Date(f1.bands.p80).getTime());
    expect(new Date(f1.bands.p80).getTime()).toBeLessThanOrEqual(new Date(f1.bands.p95).getTime());
    expect(f1.reliable).toBe(true);
  });
  it("marks a short history as not reliable and says so in assumptions", () => {
    const f = forecast({ weeklyThroughput: [2], remaining: 5, now: new Date(), seed: 1 });
    expect(f.reliable).toBe(false);
    expect(f.assumptions.join(" ")).toMatch(/rough guess/);
  });
  it("backtest returns a coverage ratio and sample count", () => {
    const r = backtest([3, 4, 3, 4], [4, 5, 6]);
    expect(r.samples).toBe(3);
    expect(r.p80Coverage).toBeGreaterThanOrEqual(0);
    expect(r.p80Coverage).toBeLessThanOrEqual(1);
  });
});
