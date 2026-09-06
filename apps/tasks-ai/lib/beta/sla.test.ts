import { describe, expect, it } from "vitest";
import { respondByFor, slaState, slaSummary, SLA_HOURS } from "./sla";

const NOW = new Date("2026-09-06T12:00:00Z");

describe("respondByFor", () => {
  it("uses severity-specific windows", () => {
    const created = new Date("2026-09-06T00:00:00Z");
    expect(respondByFor("blocker", created).getTime()).toBe(created.getTime() + 4 * 3600_000);
    expect(respondByFor("idea", created).getTime()).toBe(created.getTime() + SLA_HOURS.idea * 3600_000);
  });
});

describe("slaState", () => {
  const mk = (severity: "blocker" | "major", respondBy: string, respondedAt: string | null) => ({
    severity,
    createdAt: new Date("2026-09-06T00:00:00Z"),
    respondBy: new Date(respondBy),
    respondedAt: respondedAt ? new Date(respondedAt) : null,
  });

  it("met when responded before the deadline, overdue when responded after", () => {
    expect(slaState(mk("major", "2026-09-08T00:00:00Z", "2026-09-07T00:00:00Z"), NOW)).toBe("met");
    expect(slaState(mk("major", "2026-09-06T00:00:00Z", "2026-09-07T00:00:00Z"), NOW)).toBe("overdue");
  });

  it("overdue when unanswered past the deadline", () => {
    expect(slaState(mk("blocker", "2026-09-06T06:00:00Z", null), NOW)).toBe("overdue");
  });

  it("due_soon inside the last quarter of the window, on_track before that", () => {
    // blocker window 4h; deadline 30min out -> due_soon
    expect(slaState(mk("blocker", "2026-09-06T12:30:00Z", null), NOW)).toBe("due_soon");
    // deadline 3h out -> on_track
    expect(slaState(mk("blocker", "2026-09-06T15:00:00Z", null), NOW)).toBe("on_track");
  });
});

describe("slaSummary", () => {
  it("computes a compliance rate over closed items only", () => {
    const items = [
      { severity: "major" as const, createdAt: NOW, respondBy: new Date("2026-09-08"), respondedAt: new Date("2026-09-07") }, // met
      { severity: "major" as const, createdAt: NOW, respondBy: new Date("2026-09-05"), respondedAt: new Date("2026-09-07") }, // overdue
      { severity: "minor" as const, createdAt: NOW, respondBy: new Date("2026-09-20"), respondedAt: null }, // on_track (open)
    ];
    const s = slaSummary(items, NOW);
    expect(s.met).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.on_track).toBe(1);
    expect(s.complianceRate).toBe(0.5);
  });
});
