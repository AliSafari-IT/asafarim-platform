import type { ToolRunState } from "./run-state";

export interface StatusCopy {
  tone: "neutral" | "info" | "success" | "warning" | "error";
  title: string;
  body?: string;
}

/**
 * User-facing wording for every workbench state (charter §6).
 *
 * Rules: a fixture result always says it is a prepared example, never "your
 * result"; no non-result state may suggest that an AI call succeeded; limits
 * never nudge the user into repeated paid retries.
 */
export function describeRunState(state: ToolRunState<unknown>): StatusCopy {
  switch (state.kind) {
    case "idle":
      return { tone: "neutral", title: "Paste your text or load the example to begin." };
    case "sample":
      return {
        tone: "info",
        title: "Example loaded.",
        body: "Running it shows a prepared example result, so you can see what the tool produces.",
      };
    case "ready":
      return { tone: "neutral", title: "Ready to run." };
    case "running":
      return { tone: "info", title: "Working on it…" };
    case "success":
      return state.mode === "fixture"
        ? {
            tone: "info",
            title: "Example result",
            body: "This is prepared sample output. No AI was used to produce it, so it isn't a real result for your text.",
          }
        : {
            tone: "success",
            title: "Result ready",
            body: "Drafted by AI from your text. Review and edit it before you use it.",
          };
    case "degraded":
      return {
        tone: "warning",
        title: state.mode === "fixture" ? "Partial example result" : "Partial result",
        // `missing` holds UI-safe sentences from the server (see ToolLiveSpec.toOutput).
        body: `${state.missing.length ? state.missing.join(" ") : "Some sections couldn't be produced."} What's shown is ${
          state.mode === "fixture" ? "a prepared example, not generated from your text" : "drafted by AI — review it before use"
        }.`,
      };
    case "invalid":
      return { tone: "warning", title: "Check your input", body: state.issues.join(" ") };
    case "rate-limited":
      if (state.scope === "daily") {
        return {
          tone: "warning",
          title: "Today's live runs are used up",
          body: `No result was produced. The tools have a daily spending limit, and it's been reached${
            state.retryAfterSeconds ? `; live runs reopen in about ${formatWait(state.retryAfterSeconds)}` : ""
          }. The example still works.`,
        };
      }
      return {
        tone: "warning",
        title: "You've reached the limit for now",
        body: `No result was produced. Live runs are limited per visitor to keep the tools free${
          state.retryAfterSeconds ? `; you can run again in about ${formatWait(state.retryAfterSeconds)}` : ""
        }. The example still works.`,
      };
    case "provider-disabled":
      return state.reason === "paused"
        ? {
            tone: "warning",
            title: "Live runs are paused",
            body: "No result was produced. This tool is temporarily paused; the example and this page still work.",
          }
        : {
            tone: "warning",
            title: "Live generation isn't available",
            body: "No result was produced from your text. You can still run the example to see what the tool does.",
          };
    case "failed":
      return {
        tone: "error",
        title: "Something went wrong",
        body: `No result was produced, and nothing was saved. ${state.message ?? "Please try again in a moment."}`,
      };
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes} minutes` : `${Math.round(minutes / 60)} hours`;
}
