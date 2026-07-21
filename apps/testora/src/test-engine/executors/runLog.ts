import { EventEmitter } from "node:events";

export interface RunRecord {
  emitter: EventEmitter;
  lines: string[];
  done: boolean;
  result?: unknown;
  error?: string;
  abortController: AbortController;
  totalRuns?: number;
  label?: string;
}

// Each Next.js route handler is compiled into its own bundle, so a plain
// module-level singleton would not actually be shared between /api/run and
// /api/run/stream/[runId]. Anchoring it on globalThis keeps a single Map
// across route bundles within the same Node process.
const globalForRuns = globalThis as unknown as {
  __e2eTestoraRuns?: Map<string, RunRecord>;
};
const runs = globalForRuns.__e2eTestoraRuns ?? new Map<string, RunRecord>();
globalForRuns.__e2eTestoraRuns = runs;

export function createRun(runId: string): void {
  runs.set(runId, {
    emitter: new EventEmitter(),
    lines: [],
    done: false,
    abortController: new AbortController(),
  });
}

export function setRunMeta(
  runId: string,
  totalRuns: number,
  label: string,
): void {
  const run = runs.get(runId);
  if (!run) return;
  run.totalRuns = totalRuns;
  run.label = label;
  run.emitter.emit("meta", { totalRuns, label });
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.done) return false;
  run.abortController.abort();
  run.done = true;
  run.error = "Run cancelled";
  run.emitter.emit("error", "Run cancelled");
  return true;
}

export function appendLog(runId: string, line: string): void {
  const run = runs.get(runId);
  if (!run) return;
  run.lines.push(line);
  run.emitter.emit("log", line);
}

export function completeRun(runId: string, result: unknown): void {
  const run = runs.get(runId);
  if (!run) return;
  run.done = true;
  run.result = result;
  run.emitter.emit("done", result);
}

export function failRun(runId: string, error: string): void {
  const run = runs.get(runId);
  if (!run) return;
  run.done = true;
  run.error = error;
  run.emitter.emit("error", error);
}

export function getRun(runId: string): RunRecord | undefined {
  return runs.get(runId);
}

/**
 * Whether a run is currently executing. Used to reject overlapping runs —
 * two TestCafe instances launching browsers in the same process at once is a
 * common cause of "Cannot establish browser connection".
 */
export function hasActiveRun(): boolean {
  for (const run of runs.values()) {
    if (!run.done) return true;
  }
  return false;
}

/**
 * The currently executing run, if any. Lets a freshly loaded client discover
 * and re-attach to an in-progress run without relying on its own localStorage
 * (which may be empty, stale, or from a different browser).
 */
export function getActiveRun(): {
  runId: string;
  totalRuns?: number;
  label?: string;
} | null {
  for (const [runId, run] of runs.entries()) {
    if (!run.done) return { runId, totalRuns: run.totalRuns, label: run.label };
  }
  return null;
}
