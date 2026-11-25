import { beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock("../db/client", () => ({
  getJobmatchDb: () => ({
    tailorPreview: {
      findMany: async () => {
        sweep.calls += 1;
        if (sweep.fail) throw new Error("db down: candidate text must not be logged");
        return [];
      },
    },
    tailoringFeedback: { findMany: async () => [] },
  }),
}));
vi.mock("../workspace", () => ({ recordAuditEvent: async () => undefined }));

const retention = await import("./retention");

describe("personalization retention windows (#933)", () => {
  it("previews last 30 days and feedback 180", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(retention.previewCutoff(now).toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(retention.feedbackCutoff(now).toISOString()).toBe("2026-05-29T12:00:00.000Z");
  });
});

describe("opportunistic sweep", () => {
  beforeEach(() => {
    retention.resetOpportunisticSweepForTests();
    sweep.calls = 0;
    sweep.fail = false;
  });

  it("runs at most once an hour per process", async () => {
    const t0 = 1_000_000_000_000;
    await retention.maybeSweepPersonalization(t0);
    expect(retention.maybeSweepPersonalization(t0 + 1000)).toBeNull();
    expect(retention.maybeSweepPersonalization(t0 + retention.OPPORTUNISTIC_SWEEP_INTERVAL_MS - 1)).toBeNull();
    await retention.maybeSweepPersonalization(t0 + retention.OPPORTUNISTIC_SWEEP_INTERVAL_MS);
    expect(sweep.calls).toBe(2);
  });

  it("never throws, and logs only the error name", async () => {
    sweep.fail = true;
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    const out = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    await expect(retention.maybeSweepPersonalization(Date.now())).resolves.toBeUndefined();
    spy.mockRestore();
    out.mockRestore();
    expect(lines.join("\n")).not.toContain("candidate text");
  });
});
