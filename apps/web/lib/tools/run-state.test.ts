import { describe, expect, it } from "vitest";
import { checkInput, isConcluded, toolRunReducer, type ToolRunState } from "./run-state";

const limits = { minInputChars: 5, maxInputChars: 20 };
const exampleInput = "the example text";
type S = ToolRunState<string>;
const change = (state: S, input: string) => toolRunReducer<string>(state, { type: "input-changed", input, isExample: input === exampleInput, limits });

describe("checkInput", () => {
  it("rejects empty, too-short, and too-long input with actionable messages", () => {
    expect(checkInput("   ", limits)[0]).toMatch(/Add some text/);
    expect(checkInput("abc", limits)[0]).toMatch(/at least 5 characters/);
    expect(checkInput("x".repeat(21), limits)[0]).toMatch(/21 characters; the limit is 20/);
    expect(checkInput("just right", limits)).toEqual([]);
  });
});

describe("toolRunReducer", () => {
  it("moves between idle, sample, and ready as the input changes", () => {
    expect(change({ kind: "idle" }, exampleInput)).toEqual({ kind: "sample" });
    expect(change({ kind: "sample" }, "my own notes")).toEqual({ kind: "ready" });
    expect(change({ kind: "ready" }, "ab")).toEqual({ kind: "idle" });
    expect(change({ kind: "ready" }, "")).toEqual({ kind: "idle" });
  });

  it("clears an input error once the user edits", () => {
    expect(change({ kind: "invalid", issues: ["x"] }, "my own notes")).toEqual({ kind: "ready" });
  });

  it("never discards a result or an in-flight run when the input changes", () => {
    const success: S = { kind: "success", mode: "live", result: "r" };
    expect(change(success, "new text")).toBe(success);
    expect(change({ kind: "running" }, "new text")).toEqual({ kind: "running" });
  });

  it("accepts outcomes only for an in-flight run", () => {
    const outcome = { kind: "success", mode: "fixture", result: "r" } as const;
    const running = toolRunReducer<string>({ kind: "ready" }, { type: "run-started" });
    expect(running).toEqual({ kind: "running" });
    expect(toolRunReducer<string>(running, { type: "run-finished", outcome })).toEqual(outcome);
    expect(toolRunReducer<string>({ kind: "ready" }, { type: "run-finished", outcome })).toEqual({ kind: "ready" });
  });

  it("does not reject input while a run is in flight", () => {
    expect(toolRunReducer<string>({ kind: "running" }, { type: "input-rejected", issues: ["x"] })).toEqual({ kind: "running" });
    expect(toolRunReducer<string>({ kind: "ready" }, { type: "input-rejected", issues: ["x"] })).toEqual({
      kind: "invalid",
      issues: ["x"],
    });
  });

  it("reports which states are concluded", () => {
    expect(isConcluded({ kind: "running" })).toBe(false);
    expect(isConcluded({ kind: "failed" })).toBe(true);
    expect(isConcluded({ kind: "rate-limited" })).toBe(true);
  });
});
