import { describe, expect, it } from "vitest";
import {
  canTransitionStatus,
  isTerminalStatus,
  assertStatusTransition,
  IllegalDeploymentStatusTransitionError,
  TERMINAL_DEPLOYMENT_STATUSES,
  DEPLOYMENT_PHASE_ORDER,
  nextPhaseAfter,
  isPreActivationPhase,
} from "./stateMachine";

describe("deployment status state machine", () => {
  it("allows pending -> running -> succeeded/failed", () => {
    expect(canTransitionStatus("pending", "running")).toBe(true);
    expect(canTransitionStatus("running", "succeeded")).toBe(true);
    expect(canTransitionStatus("running", "failed")).toBe(true);
  });

  it("allows cancellation from any non-terminal status", () => {
    expect(canTransitionStatus("pending", "cancelled")).toBe(true);
    expect(canTransitionStatus("running", "cancelled")).toBe(true);
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionStatus("running", "running")).toBe(false);
  });

  it("rejects any transition out of a terminal status", () => {
    for (const status of TERMINAL_DEPLOYMENT_STATUSES) {
      expect(canTransitionStatus(status, "running")).toBe(false);
      expect(isTerminalStatus(status)).toBe(true);
    }
  });

  it("rejects skipping pending -> succeeded directly", () => {
    expect(canTransitionStatus("pending", "succeeded")).toBe(false);
  });

  it("assertStatusTransition throws for an illegal transition", () => {
    expect(() => assertStatusTransition("succeeded", "running")).toThrow(IllegalDeploymentStatusTransitionError);
  });

  it("assertStatusTransition is a no-op for a legal transition", () => {
    expect(() => assertStatusTransition("pending", "running")).not.toThrow();
  });
});

describe("deployment phase ordering", () => {
  it("advances through every phase in order up to completed", () => {
    for (let i = 0; i < DEPLOYMENT_PHASE_ORDER.length - 1; i++) {
      expect(nextPhaseAfter(DEPLOYMENT_PHASE_ORDER[i])).toBe(DEPLOYMENT_PHASE_ORDER[i + 1]);
    }
  });

  it("has no next phase after completed", () => {
    expect(nextPhaseAfter("completed")).toBeNull();
  });

  it("has no next phase after rolling_back", () => {
    expect(nextPhaseAfter("rolling_back")).toBeNull();
  });

  it("classifies every phase before activating as pre-activation", () => {
    for (const phase of DEPLOYMENT_PHASE_ORDER) {
      const expected = DEPLOYMENT_PHASE_ORDER.indexOf(phase) < DEPLOYMENT_PHASE_ORDER.indexOf("activating");
      expect(isPreActivationPhase(phase)).toBe(expected);
    }
  });

  it("activating, verifying, and completed are NOT pre-activation", () => {
    expect(isPreActivationPhase("activating")).toBe(false);
    expect(isPreActivationPhase("verifying")).toBe(false);
    expect(isPreActivationPhase("completed")).toBe(false);
  });
});
