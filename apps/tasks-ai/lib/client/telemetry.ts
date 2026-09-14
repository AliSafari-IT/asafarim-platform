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
  | { name: "workspace.home.viewed"; stage: string; mode: string }
  | { name: "workspace.activation.project_created"; from: string }
  | { name: "workspace.activation.first_task_created"; source: string }
  | { name: "workspace.activation.first_proposal_generated"; kind: string }
  | { name: "workspace.activation.first_proposal_applied"; operations: number }
  | { name: "workspace.activation.my_work_opened" };

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
