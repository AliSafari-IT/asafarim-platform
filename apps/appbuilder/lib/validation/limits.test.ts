import { describe, expect, it } from "vitest";
import { VALIDATION_LIMITS, REPAIR_LIMITS } from "./limits";

describe("VALIDATION_LIMITS", () => {
  it("bounds active runs per app to a small positive number", () => {
    expect(VALIDATION_LIMITS.MAX_ACTIVE_RUNS_PER_APP).toBeGreaterThan(0);
    expect(VALIDATION_LIMITS.MAX_ACTIVE_RUNS_PER_APP).toBeLessThanOrEqual(5);
  });

  it("bounds a single gate's execution time budget", () => {
    expect(VALIDATION_LIMITS.GATE_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("REPAIR_LIMITS", () => {
  it("bounds repair attempts per run to a small positive number — issue requirement: 'maximum repair attempts per run'", () => {
    expect(REPAIR_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN).toBeGreaterThan(0);
    expect(REPAIR_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN).toBeLessThanOrEqual(5);
  });

  it("bounds operations per repair attempt — issue requirement: 'maximum operations per attempt'", () => {
    expect(REPAIR_LIMITS.MAX_OPERATIONS_PER_ATTEMPT).toBeGreaterThan(0);
    expect(REPAIR_LIMITS.MAX_OPERATIONS_PER_ATTEMPT).toBeLessThanOrEqual(20);
  });

  it("bounds total repair wall-clock time — issue requirement: 'maximum total repair time/cost'", () => {
    expect(REPAIR_LIMITS.MAX_ATTEMPT_WALL_TIME_MS).toBeGreaterThan(0);
  });
});
