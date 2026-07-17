import { describe, expect, it } from "vitest";
import {
  PROJECT_STATES,
  canTransition,
  assertTransition,
  isTerminal,
  isProjectState,
  normalizeStatus,
} from "../project-state";

describe("project state machine", () => {
  it("registers all 15 canonical states", () => {
    expect(PROJECT_STATES).toHaveLength(15);
    expect(PROJECT_STATES).toContain("DRAFT");
    expect(PROJECT_STATES).toContain("COMPLETED");
    expect(PROJECT_STATES).toContain("FAILED");
  });

  it("allows the happy-path forward transitions", () => {
    expect(canTransition("DRAFT", "UPLOADING")).toBe(true);
    expect(canTransition("ANALYZING", "ANALYSIS_READY")).toBe(true);
    expect(canTransition("RENDERING_FINAL", "COMPLETED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransition("ANALYZING", "RENDERING_FINAL")).toBe(false);
  });

  it("lets any live state fail, but not a terminal one", () => {
    expect(canTransition("ANALYZING", "FAILED")).toBe(true);
    expect(canTransition("RENDERING_FINAL", "FAILED")).toBe(true);
    expect(canTransition("COMPLETED", "FAILED")).toBe(false);
  });

  it("treats identity as a no-op transition", () => {
    expect(canTransition("STORY_DRAFT", "STORY_DRAFT")).toBe(true);
  });

  it("supports loop-back for edits", () => {
    expect(canTransition("PREVIEW_READY", "STORY_DRAFT")).toBe(true);
    expect(canTransition("FAILED", "DRAFT")).toBe(true);
  });

  it("assertTransition throws on an illegal move", () => {
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow(/Illegal/);
    expect(() => assertTransition("DRAFT", "UPLOADING")).not.toThrow();
  });

  it("identifies terminal states", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("ANALYZING")).toBe(false);
  });

  it("validates and normalizes status strings", () => {
    expect(isProjectState("ANALYZING")).toBe(true);
    expect(isProjectState("bogus")).toBe(false);
    // legacy string values map onto canonical states
    expect(normalizeStatus("draft")).toBe("DRAFT");
    expect(normalizeStatus("rendering")).toBe("RENDERING_FINAL");
    expect(normalizeStatus("completed")).toBe("COMPLETED");
    expect(normalizeStatus(null)).toBe("DRAFT");
    expect(normalizeStatus("SCENE_PLAN_READY")).toBe("SCENE_PLAN_READY");
  });
});
