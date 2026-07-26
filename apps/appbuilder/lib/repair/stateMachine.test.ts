import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, assertTransition, IllegalRepairStateTransitionError, TERMINAL_STATUSES } from "./stateMachine";

describe("repair attempt state machine", () => {
  it("drives the full non-destructive path: queued -> classifying -> proposing -> applying -> revalidating -> completed", () => {
    expect(canTransition("queued", "classifying")).toBe(true);
    expect(canTransition("classifying", "proposing")).toBe(true);
    expect(canTransition("proposing", "applying")).toBe(true);
    expect(canTransition("applying", "revalidating")).toBe(true);
    expect(canTransition("revalidating", "completed")).toBe(true);
  });

  it("pauses at awaiting_confirmation for a destructive proposal, then proceeds to applying", () => {
    expect(canTransition("proposing", "awaiting_confirmation")).toBe(true);
    expect(canTransition("awaiting_confirmation", "applying")).toBe(true);
  });

  it("revalidating may also terminate in failed (revalidation did not pass)", () => {
    expect(canTransition("revalidating", "failed")).toBe(true);
  });

  it("allows cancellation or failure from any non-terminal status", () => {
    for (const status of ["queued", "classifying", "proposing", "awaiting_confirmation", "applying", "revalidating"] as const) {
      expect(canTransition(status, "cancelled")).toBe(true);
      expect(canTransition(status, "failed")).toBe(true);
    }
  });

  it("rejects any transition out of a terminal status", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(canTransition(status, "classifying")).toBe(false);
      expect(isTerminal(status)).toBe(true);
    }
  });

  it("rejects skipping straight from queued to applying", () => {
    expect(canTransition("queued", "applying")).toBe(false);
  });

  it("assertTransition throws IllegalRepairStateTransitionError for an illegal transition", () => {
    expect(() => assertTransition("completed", "classifying")).toThrow(IllegalRepairStateTransitionError);
  });
});
