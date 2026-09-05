import { describe, expect, it, vi } from "vitest";
import { drainTelemetry, track } from "./telemetry";

describe("telemetry", () => {
  it("buffers events with a timestamp and drains them", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00Z"));
    track({ name: "task.created", source: "quick_capture" });
    track({ name: "task.completed" });
    const drained = drainTelemetry();
    expect(drained.map((e) => e.name)).toEqual(["task.created", "task.completed"]);
    expect(drained[0].at).toBe(Date.parse("2026-09-06T00:00:00Z"));
    expect(drainTelemetry()).toEqual([]);
    vi.useRealTimers();
  });
});
