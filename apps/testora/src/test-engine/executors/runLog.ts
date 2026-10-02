import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { pool } from "@/db/client";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createRunStore, type RunRow, type RunStore } from "./runStore";
import type { RunJob } from "@/lib/run-executor";

/**
 * The run log + queue, durable (#716, ADR 0004 step 1).
 *
 * State lives in Postgres (runStore.ts): a deploy or crash no longer loses
 * queued runs, and a run left "running" by a dead process ends as
 * `error: "runner lost"` instead of hanging. Execution itself is still
 * in-process (lib/run-executor.ts); this module keeps only what can't be
 * persisted for the runs THIS process executes — abort controllers, the
 * ordered log writer, watchdog timers — on globalThis so every route bundle
 * shares it.
 *
 * Call sites keep the old names; reads and the finishing writes are async now.
 */

export type RunStatus = "queued" | "running" | "done";

export interface RunOwner {
  id: string | null;
  name: string | null;
}

/** What a queued run's client is told (stream "queue" event, POST response). */
export interface QueueInfo {
  position: number;
  running: number;
  limit: number;
}

export type Admission =
  | { status: "running" }
  | { status: "queued"; position: number }
  | { status: "rejected"; reason: "queue-full" };

/** Read an integer setting from the environment, clamped to [min, max]. */
export function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** A cancelled run's browser gets this long to stop before its slot is freed anyway. */
const CANCEL_GRACE_MS = 30_000;
/** Hard ceiling per run; a run still going after this is failed and its slot freed. */
const MAX_RUN_MS = intFromEnv(process.env.TESTORA_MAX_RUN_MINUTES, 45, 5, 240) * 60_000;
/** Lease length and renewal cadence (renew well before expiry). */
const LEASE_MS = 30_000;
const TICK_MS = 5_000;
/** Finished runs (and their logs) are kept this long, then pruned. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface LocalRun {
  abort: AbortController;
  /** Serialises this run's event writes so seq order = emit order. */
  chain: Promise<unknown>;
  finished: boolean;
  cancelled: boolean;
  watchdog?: ReturnType<typeof setTimeout>;
}

interface RunLogState {
  instanceId: string;
  store: RunStore;
  local: Map<string, LocalRun>;
  worker?: ReturnType<typeof setInterval>;
  booted?: Promise<void>;
  lastPrune: number;
}

// Each Next.js route bundle gets its own module instance; anchor the state on
// globalThis (versioned key, so a hot reload with new code replaces it).
const globalForRuns = globalThis as unknown as { __testoraRunLogV3?: RunLogState };

function state(): RunLogState {
  if (!globalForRuns.__testoraRunLogV3) {
    globalForRuns.__testoraRunLogV3 = {
      // host:pid:boot — a restart on the same host gets a new id, which lets
      // the boot sweep tell its predecessor's runs apart from live ones.
      instanceId: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
      store: createRunStore(pool, {
        limit: intFromEnv(process.env.TESTORA_MAX_CONCURRENT_RUNS, 2, 1, 4),
        maxQueue: intFromEnv(process.env.TESTORA_MAX_QUEUED_RUNS, 20, 1, 200),
        leaseMs: LEASE_MS,
      }),
      local: new Map(),
      lastPrune: 0,
    };
  }
  return globalForRuns.__testoraRunLogV3;
}

export function runStore(): RunStore {
  return state().store;
}

function local(runId: string): LocalRun {
  const s = state();
  let run = s.local.get(runId);
  if (!run) {
    run = { abort: new AbortController(), chain: Promise.resolve(), finished: false, cancelled: false };
    s.local.set(runId, run);
  }
  return run;
}

/** Queue an event write after this run's earlier ones; never throws. */
function emit(runId: string, kind: string, payload: unknown): Promise<unknown> {
  const run = local(runId);
  run.chain = run.chain
    .then(() => state().store.append(runId, kind, payload))
    .catch((error) => console.error(`[testora] run ${runId}: could not record "${kind}":`, error));
  return run.chain;
}

// ── Creating and admitting ─────────────────────────────────────────────────

export async function createRun(
  runId: string,
  owner: RunOwner = { id: null, name: null },
  extra: { projectId?: string | null; targetId?: string | null; rateKey?: string | null } = {},
): Promise<void> {
  await state().store.create({ id: runId, ownerId: owner.id, ownerName: owner.name, ...extra });
  local(runId);
}

export async function setRunMeta(runId: string, totalRuns: number, label: string): Promise<void> {
  await state().store.setMeta(runId, totalRuns, label);
  await emit(runId, "meta", { totalRuns, label });
}

/** Append a log line. Fire-and-forget; lines are recorded in call order. */
export function appendLog(runId: string, line: string): void {
  void emit(runId, "log", line);
}

/**
 * Freeze the run's job (encrypted — it holds target secrets) and queue it.
 * It starts now if a runner is free, otherwise when one frees up — in this
 * process or, after a restart, in the next one.
 */
export async function scheduleRun(runId: string, job: RunJob): Promise<Admission> {
  const s = state();
  ensureRunWorker();
  await local(runId).chain; // the pre-admission log lines first
  const { admission, claimed } = await s.store.admit(runId, encryptToken(JSON.stringify(job)), s.instanceId);
  if (admission.status === "queued") {
    const running = (await s.store.snapshot()).running.length;
    appendLog(
      runId,
      `⏳ Queued — ${running} of ${s.store.limit} test runners are busy. You're #${admission.position} in line; this run starts automatically when a runner frees up.`,
    );
  } else if (admission.status === "rejected") {
    await emit(runId, "error", "The test queue is full");
    s.local.delete(runId);
  }
  startClaimed(claimed);
  return admission;
}

// ── Executing (this process) ───────────────────────────────────────────────

function startClaimed(rows: RunRow[]): void {
  for (const row of rows) void startRun(row);
}

async function startRun(row: RunRow): Promise<void> {
  const run = local(row.id);
  const waitedMs = Date.now() - row.queuedAt.getTime();
  if (waitedMs > 1000) {
    appendLog(row.id, `▶ A runner is free — starting now (waited ${Math.round(waitedMs / 1000)}s in the queue).`);
  }
  void emit(row.id, "started", { waitedMs });

  // A run that never finishes (hung browser, stuck target) must not hold a
  // runner forever — with only a few runners that would stall the queue.
  run.watchdog = setTimeout(() => {
    if (run.finished) return;
    const minutes = Math.round(MAX_RUN_MS / 60_000);
    appendLog(row.id, `✖ Stopped after ${minutes} minutes — the maximum run time — to free the runner for others.`);
    run.abort.abort();
    void failRun(row.id, `Run exceeded the ${minutes}-minute limit and was stopped`);
  }, MAX_RUN_MS);
  run.watchdog.unref?.();

  const raw = row.jobEnc ? decryptToken(row.jobEnc) : null;
  if (!raw) {
    await failRun(row.id, "This run's job could not be read (was TESTORA_SECRET changed?)");
    return;
  }
  try {
    const { runInBackground } = await import("@/lib/run-executor");
    const job = JSON.parse(raw) as RunJob;
    await runInBackground(row.id, job.plan, job.env);
  } catch (error) {
    if (!run.finished) await failRun(row.id, error instanceof Error ? error.message : "Run failed");
  }
}

/** The abort signal of a run this process executes. */
export function runSignal(runId: string): AbortSignal | undefined {
  return state().local.get(runId)?.abort.signal;
}

/** Whether this process already finished (or cancelled) the run. */
export function isRunFinished(runId: string): boolean {
  const run = state().local.get(runId);
  return !run || run.finished;
}

async function finishLocal(
  runId: string,
  outcome: { result: unknown } | { error: string },
): Promise<void> {
  const s = state();
  const run = local(runId);
  if (run.finished) return;
  run.finished = true;
  if (run.watchdog) clearTimeout(run.watchdog);
  await run.chain;
  if (run.cancelled) {
    // The client already got "Run cancelled"; just free the slot.
    await s.store.finish(runId, "cancelled", "Run cancelled");
  } else if ("error" in outcome) {
    await emit(runId, "error", outcome.error);
    await s.store.finish(runId, "error", outcome.error);
  } else {
    await emit(runId, "done", outcome.result);
    await s.store.finish(runId, "done");
  }
  s.local.delete(runId);
  // A slot freed up: hand it to the next queued run.
  startClaimed(await s.store.claimNext(s.instanceId).catch(() => []));
}

export async function completeRun(runId: string, result: unknown): Promise<void> {
  await finishLocal(runId, { result });
}

export async function failRun(runId: string, error: string): Promise<void> {
  await finishLocal(runId, { error });
}

/**
 * Cancel a run. A queued run just leaves the queue. A running one is flagged:
 * its process aborts TestCafe (now, if that's us; else on its next heartbeat)
 * and frees the slot when the run settles — or after a grace period if the
 * browser session never returns.
 */
export async function cancelRun(runId: string): Promise<boolean> {
  const s = state();
  const outcome = await s.store.requestCancel(runId);
  if (!outcome) return false;
  await emit(runId, "error", "Run cancelled");
  if (outcome === "dequeued") {
    s.local.delete(runId);
    return true;
  }
  const run = s.local.get(runId);
  if (run) abortLocal(runId, run);
  return true;
}

function abortLocal(runId: string, run: LocalRun): void {
  if (run.cancelled) return;
  run.cancelled = true;
  run.abort.abort();
  setTimeout(() => void finishLocal(runId, { error: "Run cancelled" }), CANCEL_GRACE_MS).unref?.();
}

// ── Reads ──────────────────────────────────────────────────────────────────

export interface RunView {
  status: RunStatus;
  /** Finished, failed, cancelled — or cancel requested (it's ending). */
  done: boolean;
  owner: RunOwner;
  totalRuns?: number;
  label?: string;
  error?: string;
}

export async function getRun(runId: string): Promise<RunView | undefined> {
  const row = await state().store.get(runId);
  if (!row) return undefined;
  const active = row.status === "queued" || row.status === "running" || row.status === "created";
  return {
    status: row.status === "queued" || row.status === "created" ? "queued" : row.status === "running" ? "running" : "done",
    done: !active || row.cancelRequested,
    owner: { id: row.ownerId, name: row.ownerName },
    totalRuns: row.total ?? undefined,
    label: row.label ?? undefined,
    error: row.error ?? undefined,
  };
}

export async function queueInfo(runId: string): Promise<QueueInfo | null> {
  const s = state();
  const position = await s.store.position(runId);
  if (position == null) return null;
  return { position, running: (await s.store.snapshot()).running.length, limit: s.store.limit };
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
 * first active run may belong to someone else.
 */
export async function getActiveRunFor(ownerId: string | null): Promise<ActiveRunSummary | null> {
  const s = state();
  const row = await s.store.activeFor(ownerId);
  if (!row) return null;
  const position = row.status === "queued" ? ((await s.store.position(row.id)) ?? undefined) : undefined;
  return {
    runId: row.id,
    status: row.status === "queued" ? "queued" : "running",
    totalRuns: row.total ?? undefined,
    label: row.label ?? undefined,
    position,
  };
}

export interface CapacitySnapshot {
  limit: number;
  maxQueue: number;
  running: { runId: string; label: string | null; owner: string | null; startedAt: number | null }[];
  queued: { runId: string; label: string | null; owner: string | null; position: number }[];
}

/** Who is using the runners right now — shown on the Run page. */
export async function getCapacity(): Promise<CapacitySnapshot> {
  const s = state();
  const snap = await s.store.snapshot();
  return {
    limit: s.store.limit,
    maxQueue: s.store.maxQueue,
    running: snap.running.map((r) => ({
      runId: r.id,
      label: r.label,
      owner: r.ownerName,
      startedAt: r.startedAt?.getTime() ?? null,
    })),
    queued: snap.queued.map((r, index) => ({ runId: r.id, label: r.label, owner: r.ownerName, position: index + 1 })),
  };
}

// ── The worker loop ────────────────────────────────────────────────────────

/**
 * Start this process's queue worker (idempotent): at boot, fail the runs a
 * dead predecessor on this host left "running"; then every few seconds renew
 * our leases (and pick up cancels from other processes), fail runs whose
 * lease lapsed elsewhere, and fill free slots from the queue.
 */
export function ensureRunWorker(): Promise<void> {
  const s = state();
  if (!s.booted) {
    s.booted = (async () => {
      await failLost(await s.store.sweepLost({ deadOwnerPrefix: `${hostname()}:`, currentOwner: s.instanceId }));
      startClaimed(await s.store.claimNext(s.instanceId));
    })().catch((error) => console.error("[testora] run worker boot failed:", error));
    s.worker = setInterval(() => void tick(), TICK_MS);
    s.worker.unref?.();
  }
  return s.booted;
}

async function failLost(ids: string[]): Promise<void> {
  for (const id of ids) {
    await state().store.append(id, "error", "runner lost — the server restarted while this run was executing. Start it again.").catch(() => {});
  }
}

async function tick(): Promise<void> {
  const s = state();
  try {
    const { cancel } = await s.store.heartbeat(s.instanceId, [...s.local.keys()]);
    for (const id of cancel) {
      const run = s.local.get(id);
      if (run) abortLocal(id, run);
    }
    await failLost(await s.store.sweepLost());
    startClaimed(await s.store.claimNext(s.instanceId));
    if (Date.now() - s.lastPrune > 60 * 60 * 1000) {
      s.lastPrune = Date.now();
      await s.store.prune(RETENTION_MS);
    }
  } catch (error) {
    console.error("[testora] run worker tick failed:", error);
  }
}

/** Stop the worker (tests). */
export function stopRunWorker(): void {
  const s = state();
  if (s.worker) clearInterval(s.worker);
  s.worker = undefined;
  s.booted = undefined;
}
