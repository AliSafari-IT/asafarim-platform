import { EventEmitter } from "node:events";
import { RunScheduler, intFromEnv, type Admission } from "./runScheduler";

export type RunStatus = "queued" | "running" | "done";

export interface RunOwner {
  id: string | null;
  name: string | null;
}

export interface RunRecord {
  emitter: EventEmitter;
  lines: string[];
  status: RunStatus;
  done: boolean;
  result?: unknown;
  error?: string;
  abortController: AbortController;
  totalRuns?: number;
  label?: string;
  owner: RunOwner;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** 1-based place in the queue while status === "queued". */
  position?: number;
  /** Max-duration watchdog, armed when the run starts. */
  watchdog?: ReturnType<typeof setTimeout>;
}

/** What a queued run's client is told (stream "queue" event, POST response). */
export interface QueueInfo {
  position: number;
  running: number;
  limit: number;
}

/**
 * Emit to a run's listeners (its live SSE streams) without ever letting a
 * listener's failure propagate. Emits happen inside the run itself (the
 * TestCafe log writer) and inside cancel requests — a throwing subscriber must
 * never break either.
 */
function safeEmit(run: RunRecord, event: string, payload?: unknown): void {
  try {
    run.emitter.emit(event, payload);
  } catch (error) {
    console.error(`[testora] run listener failed on "${event}":`, error);
  }
}

/** A cancelled run's browser gets this long to stop before its slot is freed anyway. */
const CANCEL_GRACE_MS = 30_000;
/** Hard ceiling per run; a run still going after this is failed and its slot freed. */
const MAX_RUN_MS = intFromEnv(process.env.TESTORA_MAX_RUN_MINUTES, 45, 5, 240) * 60_000;

// Each Next.js route handler is compiled into its own bundle, so a plain
// module-level singleton would not actually be shared between /api/run and
// /api/run/stream/[runId]. Anchoring it on globalThis keeps a single Map
// (and a single scheduler) across route bundles within the same Node process.
const globalForRuns = globalThis as unknown as {
  __e2eTestoraRuns?: Map<string, RunRecord>;
  __e2eTestoraSchedulerV2?: RunScheduler;
};
const runs = globalForRuns.__e2eTestoraRuns ?? new Map<string, RunRecord>();
globalForRuns.__e2eTestoraRuns = runs;

/**
 * At most TESTORA_MAX_CONCURRENT_RUNS (default 2, clamped 1–4) runs drive a
 * browser at once; up to TESTORA_MAX_QUEUED_RUNS (default 20) more wait their
 * turn. The queue lives in this process: a restart drops queued runs along
 * with the running ones (clients are told the run ended and can start again).
 */
const scheduler =
  // Versioned key: a dev hot-reload that changes the scheduler replaces the
  // old instance instead of reusing one built from stale code.
  globalForRuns.__e2eTestoraSchedulerV2 ??
  new RunScheduler({
    limit: intFromEnv(process.env.TESTORA_MAX_CONCURRENT_RUNS, 2, 1, 4),
    maxQueue: intFromEnv(process.env.TESTORA_MAX_QUEUED_RUNS, 20, 1, 200),
    onStart: (runId) => {
      const run = runs.get(runId);
      if (!run || run.done) return;
      const waitedMs = Date.now() - run.queuedAt;
      const wasQueued = run.status === "queued";
      run.status = "running";
      run.startedAt = Date.now();
      run.position = undefined;
      if (wasQueued && waitedMs > 1000) {
        appendLog(runId, `▶ A runner is free — starting now (waited ${Math.round(waitedMs / 1000)}s in the queue).`);
      }
      safeEmit(run, "started", { waitedMs });
      // A run that never finishes (hung browser, stuck target) must not hold
      // a runner forever — with only a few runners that would stall the queue.
      run.watchdog = setTimeout(() => {
        if (run.done) return;
        const minutes = Math.round(MAX_RUN_MS / 60_000);
        appendLog(runId, `✖ Stopped after ${minutes} minutes — the maximum run time — to free the runner for others.`);
        run.abortController.abort();
        failRun(runId, `Run exceeded the ${minutes}-minute limit and was stopped`);
        setTimeout(() => scheduler.release(runId), CANCEL_GRACE_MS).unref?.();
      }, MAX_RUN_MS);
      run.watchdog.unref?.();
    },
    onPositions: (positions) => {
      const running = scheduler.snapshot().running.length;
      for (const [runId, position] of positions) {
        const run = runs.get(runId);
        if (!run || run.done) continue;
        run.position = position;
        safeEmit(run, "queue", { position, running, limit: scheduler.limit } satisfies QueueInfo);
      }
    },
  });
globalForRuns.__e2eTestoraSchedulerV2 = scheduler;

// Finished runs are kept briefly so a reconnecting client can still read the
// outcome, then dropped so the map doesn't grow for the life of the process.
const FINISHED_RUN_TTL_MS = 60 * 60 * 1000;

function pruneFinishedRuns(): void {
  const cutoff = Date.now() - FINISHED_RUN_TTL_MS;
  for (const [runId, run] of runs) {
    if (run.done && (run.finishedAt ?? 0) < cutoff) runs.delete(runId);
  }
}

export function createRun(runId: string, owner: RunOwner = { id: null, name: null }): void {
  pruneFinishedRuns();
  runs.set(runId, {
    emitter: new EventEmitter(),
    lines: [],
    status: "queued",
    done: false,
    abortController: new AbortController(),
    owner,
    queuedAt: Date.now(),
  });
}

/**
 * Hand a created run to the scheduler: it starts now if a runner is free,
 * otherwise waits in the queue. A queued run is told where it stands.
 */
export function scheduleRun(runId: string, start: () => Promise<void>): Admission {
  const admission = scheduler.submit(runId, start);
  const run = runs.get(runId);
  if (!run) return admission;
  if (admission.status === "queued") {
    run.status = "queued";
    run.position = admission.position;
    const running = scheduler.snapshot().running.length;
    appendLog(
      runId,
      `⏳ Queued — ${running} of ${scheduler.limit} test runners are busy. You're #${admission.position} in line; this run starts automatically when a runner frees up.`,
    );
    safeEmit(run, "queue", { position: admission.position, running, limit: scheduler.limit } satisfies QueueInfo);
  } else if (admission.status === "rejected") {
    run.status = "done";
    run.done = true;
    run.finishedAt = Date.now();
    run.error = "The test queue is full";
  }
  return admission;
}

export function queueInfo(runId: string): QueueInfo | null {
  const position = scheduler.positionOf(runId);
  if (position == null) return null;
  return { position, running: scheduler.snapshot().running.length, limit: scheduler.limit };
}

export function setRunMeta(runId: string, totalRuns: number, label: string): void {
  const run = runs.get(runId);
  if (!run) return;
  run.totalRuns = totalRuns;
  run.label = label;
  safeEmit(run, "meta", { totalRuns, label });
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.done) return false;
  // A queued run just leaves the queue. A running one is aborted: TestCafe
  // stops and the slot is released when the run's promise settles — or after
  // a grace period if its browser session never returns.
  const wasQueued = scheduler.cancelQueued(runId);
  run.abortController.abort();
  finish(run, { error: "Run cancelled" });
  if (!wasQueued) setTimeout(() => scheduler.release(runId), CANCEL_GRACE_MS).unref?.();
  return true;
}

export function appendLog(runId: string, line: string): void {
  const run = runs.get(runId);
  if (!run) return;
  run.lines.push(line);
  safeEmit(run, "log", line);
}

function finish(run: RunRecord, outcome: { result: unknown } | { error: string }): void {
  run.done = true;
  run.status = "done";
  run.finishedAt = Date.now();
  run.position = undefined;
  if (run.watchdog) clearTimeout(run.watchdog);
  if ("error" in outcome) {
    run.error = outcome.error;
    safeEmit(run, "error", outcome.error);
  } else {
    run.result = outcome.result;
    safeEmit(run, "done", outcome.result);
  }
}

export function completeRun(runId: string, result: unknown): void {
  const run = runs.get(runId);
  if (!run || run.done) return;
  finish(run, { result });
}

export function failRun(runId: string, error: string): void {
  const run = runs.get(runId);
  if (!run || run.done) return;
  finish(run, { error });
}

export function getRun(runId: string): RunRecord | undefined {
  return runs.get(runId);
}

export interface ActiveRunSummary {
  runId: string;
  status: Exclude<RunStatus, "done">;
  totalRuns?: number;
  label?: string;
  position?: number;
}

/**
 * The viewer's own unfinished run (most recent first), so a freshly loaded
 * client re-attaches to *its* run — with several people running tests, the
 * first active run in the map may belong to someone else.
 */
export function getActiveRunFor(ownerId: string | null): ActiveRunSummary | null {
  let best: [string, RunRecord] | null = null;
  for (const entry of runs.entries()) {
    const run = entry[1];
    if (run.done || run.owner.id !== ownerId) continue;
    if (!best || run.queuedAt > best[1].queuedAt) best = entry;
  }
  if (!best) return null;
  const [runId, run] = best;
  return {
    runId,
    status: run.status === "queued" ? "queued" : "running",
    totalRuns: run.totalRuns,
    label: run.label,
    position: run.position,
  };
}

export interface CapacitySnapshot {
  limit: number;
  maxQueue: number;
  running: { runId: string; label: string | null; owner: string | null; startedAt: number | null }[];
  queued: { runId: string; label: string | null; owner: string | null; position: number }[];
}

/** Who is using the runners right now — shown on the Run page. */
export function getCapacity(): CapacitySnapshot {
  const snap = scheduler.snapshot();
  const describe = (runId: string) => {
    const run = runs.get(runId);
    return { runId, label: run?.label ?? null, owner: run?.owner.name ?? null };
  };
  return {
    limit: snap.limit,
    maxQueue: snap.maxQueue,
    running: snap.running.map((runId) => ({ ...describe(runId), startedAt: runs.get(runId)?.startedAt ?? null })),
    queued: snap.queued.map((runId, index) => ({ ...describe(runId), position: index + 1 })),
  };
}
