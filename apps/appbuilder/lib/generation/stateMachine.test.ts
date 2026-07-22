import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminal, IllegalStateTransitionError, TERMINAL_STATUSES } from "./stateMachine";

describe("isTerminal / TERMINAL_STATUSES", () => {
  it("classifies ready/failed/cancelled as terminal and nothing else", () => {
    expect(isTerminal("ready")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    for (const status of ["queued", "analyzing", "needs_clarification", "planning", "applying", "validating", "preparing_preview"] as const) {
      expect(isTerminal(status)).toBe(false);
    }
    expect(TERMINAL_STATUSES.size).toBe(3);
  });
});

describe("canTransition", () => {
  it("allows the documented forward-progress path end to end", () => {
    expect(canTransition("queued", "analyzing")).toBe(true);
    expect(canTransition("analyzing", "planning")).toBe(true);
    expect(canTransition("analyzing", "needs_clarification")).toBe(true);
    expect(canTransition("needs_clarification", "analyzing")).toBe(true);
    expect(canTransition("planning", "applying")).toBe(true);
    expect(canTransition("applying", "planning")).toBe(true);
    expect(canTransition("applying", "validating")).toBe(true);
    expect(canTransition("validating", "preparing_preview")).toBe(true);
    expect(canTransition("preparing_preview", "ready")).toBe(true);
  });

  it("rejects skipping straight from queued to ready", () => {
    expect(canTransition("queued", "ready")).toBe(false);
  });

  it("rejects going backward from validating to analyzing", () => {
    expect(canTransition("validating", "analyzing")).toBe(false);
  });

  it("rejects a no-op transition (from === to)", () => {
    expect(canTransition("planning", "planning")).toBe(false);
    expect(canTransition("ready", "ready")).toBe(false);
  });

  it("never allows a transition out of any terminal status, including toward cancelled/failed", () => {
    for (const from of ["ready", "failed", "cancelled"] as const) {
      expect(canTransition(from, "analyzing")).toBe(false);
      expect(canTransition(from, "cancelled")).toBe(false);
      expect(canTransition(from, "failed")).toBe(false);
    }
  });

  it("allows cancellation/failure from every non-terminal status", () => {
    for (const from of [
      "queued",
      "analyzing",
      "needs_clarification",
      "planning",
      "applying",
      "validating",
      "preparing_preview",
    ] as const) {
      expect(canTransition(from, "cancelled")).toBe(true);
      expect(canTransition(from, "failed")).toBe(true);
    }
  });
});

describe("assertTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertTransition("queued", "analyzing")).not.toThrow();
  });

  it("throws IllegalStateTransitionError with from/to attached for an illegal transition", () => {
    try {
      assertTransition("ready", "analyzing");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalStateTransitionError);
      expect((err as InstanceType<typeof IllegalStateTransitionError>).from).toBe("ready");
      expect((err as InstanceType<typeof IllegalStateTransitionError>).to).toBe("analyzing");
    }
  });
});
