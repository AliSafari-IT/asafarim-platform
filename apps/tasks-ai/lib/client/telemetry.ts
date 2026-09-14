"use client";

/**
 * Client instrumentation for the M03 KPIs (docs/research/kpi-dictionary.md):
 * time-to-first-project, time-to-first-task, completion, view performance.
 *
 * M03 records to the console + a buffered POST to /api/v1 telemetry is a
 * later concern; the call sites and the event names are what matter now so
 * the metrics can be wired without touching feature code.
 */
/**
 * Activation events (issue #365) sit alongside — not on top of — the
 * lifecycle events above. `project.created` fires for every project;
 * `workspace.activation.project_created` fires only for the one that turns
 * an empty workspace into a usable one, which is the moment the activation
 * funnel measures.
 */
type TelemetryEvent =
  | { name: "view.opened"; viewType: string; ms?: number }
  | { name: "project.created"; ms_since_signup?: number }
  | { name: "task.created"; source: string }
  | { name: "task.completed" }
  | { name: "command_palette.action"; action: string }
  // Capture + triage funnel (issue #366): how work gets in, and how long it
  // waits before somebody organizes it.
  | { name: "capture.opened"; from: string }
  | { name: "capture.completed"; source: string; destination: "inbox" | "project" }
  | { name: "inbox.viewed"; items: number }
  | { name: "inbox.triaged"; action: string }
  // Daily execution (issue #367): what the day actually looked like when
  // My Work opened, and which planning actions people take from it.
  | { name: "my_work.viewed"; overdue: number; today: number; upcoming: number; blocked: number; undated: number }
  | { name: "my_work.action"; action: string }
  | { name: "my_work.empty"; kind: string }
  | { name: "my_work.focus_opened" }
  | { name: "workspace.home.viewed"; stage: string; mode: string }
  | { name: "workspace.activation.project_created"; from: string }
  | { name: "workspace.activation.first_task_created"; source: string }
  | { name: "workspace.activation.first_proposal_generated"; kind: string }
  | { name: "workspace.activation.first_proposal_applied"; operations: number }
  | { name: "workspace.activation.my_work_opened" }
  // Intent-to-plan workflow (issue #368). The activation events above stay
  // as they are — they measure the *first* proposal in a workspace, once.
  // These measure the funnel every time somebody walks it, which is what
  // tells us where the workflow loses people. `intent` is the plain-language
  // outcome the user picked, not the internal AI kind.
  | { name: "copilot.opened"; from: string; intent: string }
  | { name: "copilot.source_added"; intent: string; chars: number }
  | { name: "copilot.proposal_generated"; intent: string; operations: number; degraded: boolean }
  | { name: "copilot.proposal_reviewed"; intent: string; operations: number; assumptions: number }
  | { name: "copilot.proposal_partially_applied"; accepted: number; total: number; edited: boolean }
  | { name: "copilot.proposal_applied"; accepted: number; total: number; edited: boolean }
  | { name: "copilot.proposal_rejected"; intent: string; operations: number }
  | { name: "copilot.result_opened"; target: string };

const buffer: (TelemetryEvent & { at: number })[] = [];

export function track(event: TelemetryEvent): void {
  const record = { ...event, at: Date.now() };
  buffer.push(record);
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[telemetry]", record);
  }
}

export function measureView(viewType: string): () => void {
  const start = performance.now();
  return () => track({ name: "view.opened", viewType, ms: Math.round(performance.now() - start) });
}

/** Test/inspection hook. */
export function drainTelemetry(): (TelemetryEvent & { at: number })[] {
  return buffer.splice(0, buffer.length);
}
