import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, IllegalModificationStateTransitionError, isTerminal } from "./stateMachine";

describe("modification job state machine", () => {
  it("allows the full happy-path chain including the destructive-confirmation detour", () => {
    expect(canTransition("queued", "interpreting")).toBe(true);
    expect(canTransition("interpreting", "proposing")).toBe(true);
    expect(canTransition("proposing", "applying")).toBe(true);
    expect(canTransition("proposing", "awaiting_confirmation")).toBe(true);
    expect(canTransition("awaiting_confirmation", "applying")).toBe(true);
    expect(canTransition("applying", "validating")).toBe(true);
    expect(canTransition("validating", "preparing_preview")).toBe(true);
    expect(canTransition("preparing_preview", "ready")).toBe(true);
  });

  it("allows cancelled/failed from any non-terminal status", () => {
    for (const from of ["queued", "interpreting", "proposing", "awaiting_confirmation", "applying", "validating", "preparing_preview"] as const) {
      expect(canTransition(from, "cancelled")).toBe(true);
      expect(canTransition(from, "failed")).toBe(true);
    }
  });

  it("never allows a no-op transition", () => {
    expect(canTransition("proposing", "proposing")).toBe(false);
  });

  it("never allows leaving a terminal status", () => {
    for (const from of ["ready", "failed", "cancelled"] as const) {
      expect(canTransition(from, "interpreting")).toBe(false);
      expect(canTransition(from, "applying")).toBe(false);
    }
  });

  it("rejects skipping straight from queued to ready", () => {
    expect(canTransition("queued", "ready")).toBe(false);
  });

  it("rejects going backward from validating to proposing", () => {
    expect(canTransition("validating", "proposing")).toBe(false);
  });

  it("rejects applying directly from proposing to preparing_preview (must pass through validating)", () => {
    expect(canTransition("proposing", "preparing_preview")).toBe(false);
  });

  it("assertTransition throws IllegalModificationStateTransitionError for an illegal move", () => {
    expect(() => assertTransition("ready", "applying")).toThrow(IllegalModificationStateTransitionError);
  });

  it("assertTransition is silent for a legal move", () => {
    expect(() => assertTransition("queued", "interpreting")).not.toThrow();
  });

  it("isTerminal matches exactly ready/failed/cancelled", () => {
    expect(isTerminal("ready")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("awaiting_confirmation")).toBe(false);
    expect(isTerminal("queued")).toBe(false);
  });
});
