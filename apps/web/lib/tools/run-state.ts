import type { ToolLimits, ToolRunOutcome } from "./types";

/**
 * Every state the shared workbench can be in. The `success`/`degraded`
 * variants are the only ones that carry a result, so an error state cannot
 * accidentally render one.
 */
export type ToolRunState<TResult> =
  | { kind: "idle" }
  | { kind: "sample" }
  | { kind: "ready" }
  | { kind: "running" }
  | ToolRunOutcome<TResult>;

export type ToolRunAction<TResult> =
  | { type: "input-changed"; input: string; exampleInput: string; limits: ToolLimits }
  | { type: "input-rejected"; issues: string[] }
  | { type: "run-started" }
  | { type: "run-finished"; outcome: ToolRunOutcome<TResult> };

/** Client-side checks run before any request. Empty array means OK to run. */
export function checkInput(input: string, limits: ToolLimits): string[] {
  const length = input.trim().length;
  if (length === 0) return ["Add some text first, or load the example."];
  if (length < limits.minInputChars) {
    return [`Add a little more text — at least ${limits.minInputChars} characters.`];
  }
  if (input.length > limits.maxInputChars) {
    return [
      `Your text is ${input.length.toLocaleString("en")} characters; the limit is ${limits.maxInputChars.toLocaleString("en")}. Shorten it and try again.`,
    ];
  }
  return [];
}

export function toolRunReducer<TResult>(
  state: ToolRunState<TResult>,
  action: ToolRunAction<TResult>
): ToolRunState<TResult> {
  switch (action.type) {
    case "input-changed": {
      // Editing while a run is in flight doesn't change what is being run, and
      // editing the input never discards a result the user may be reviewing.
      if (state.kind === "running" || state.kind === "success" || state.kind === "degraded") return state;
      if (!action.input.trim()) return { kind: "idle" };
      if (action.input === action.exampleInput) return { kind: "sample" };
      return checkInput(action.input, action.limits).length ? { kind: "idle" } : { kind: "ready" };
    }
    case "input-rejected":
      return state.kind === "running" ? state : { kind: "invalid", issues: action.issues };
    case "run-started":
      return state.kind === "running" ? state : { kind: "running" };
    case "run-finished":
      // A late outcome after the user moved on is ignored by the caller via
      // AbortSignal; here we only accept outcomes for an in-flight run.
      return state.kind === "running" ? action.outcome : state;
  }
}

/** True once a run has concluded (successfully or not). Used for focus moves. */
export function isConcluded(state: ToolRunState<unknown>): boolean {
  return !["idle", "sample", "ready", "running"].includes(state.kind);
}
