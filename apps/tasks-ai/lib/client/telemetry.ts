"use client";

/**
 * Client instrumentation for the M03 KPIs (docs/research/kpi-dictionary.md):
 * time-to-first-project, time-to-first-task, completion, view performance.
 *
 * M03 records to the console + a buffered POST to /api/v1 telemetry is a
 * later concern; the call sites and the event names are what matter now so
 * the metrics can be wired without touching feature code.
 */
type TelemetryEvent =
  | { name: "view.opened"; viewType: string; ms?: number }
  | { name: "project.created"; ms_since_signup?: number }
  | { name: "task.created"; source: string }
  | { name: "task.completed" }
  | { name: "command_palette.action"; action: string };

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
