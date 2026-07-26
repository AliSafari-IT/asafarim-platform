import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, assertTransition, IllegalValidationRunTransitionError, TERMINAL_STATUSES } from "./stateMachine";

describe("validation run state machine", () => {
  it("allows pending -> running -> passed/failed/infrastructure_error/flaky", () => {
    expect(canTransition("pending", "running")).toBe(true);
    expect(canTransition("running", "passed")).toBe(true);
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("running", "infrastructure_error")).toBe(true);
    expect(canTransition("running", "flaky")).toBe(true);
  });

  it("allows cancellation from any non-terminal status", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("running", "cancelled")).toBe(true);
  });

  it("rejects a no-op transition", () => {
    expect(canTransition("running", "running")).toBe(false);
  });

  it("rejects any transition out of a terminal status", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(canTransition(status, "running")).toBe(false);
      expect(isTerminal(status)).toBe(true);
    }
  });

  it("rejects skipping pending -> passed directly", () => {
    expect(canTransition("pending", "passed")).toBe(false);
  });

  it("assertTransition throws IllegalValidationRunTransitionError for an illegal transition", () => {
    expect(() => assertTransition("passed", "running")).toThrow(IllegalValidationRunTransitionError);
  });

  it("assertTransition is a no-op for a legal transition", () => {
    expect(() => assertTransition("pending", "running")).not.toThrow();
  });
});
