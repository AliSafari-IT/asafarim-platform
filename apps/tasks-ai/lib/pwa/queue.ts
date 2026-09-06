/**
 * Offline mutation queue (docs: M11). Pure state machine — the IndexedDB
 * binding is a thin adapter (lib/pwa/store.ts). Only an allowlist of
 * mutations is queueable; a queued mutation carries the resource `version`
 * it was made against, so a replay that 409s is surfaced as a conflict
 * rather than silently lost.
 */
export const QUEUEABLE = [
  "task.create",
  "task.update",
  "task.complete",
  "comment.create",
] as const;
export type QueueableKind = (typeof QUEUEABLE)[number];

export interface QueuedMutation {
  id: string;
  kind: QueueableKind;
  /** the /api/v1 path + method + body to replay */
  request: { method: "POST" | "PATCH"; path: string; body: unknown; version?: number };
  createdAt: number;
  attempts: number;
  status: "pending" | "in_flight" | "conflict" | "failed";
  lastError?: string;
}

export function isQueueable(kind: string): kind is QueueableKind {
  return (QUEUEABLE as readonly string[]).includes(kind);
}

export function enqueue(
  queue: QueuedMutation[],
  kind: QueueableKind,
  request: QueuedMutation["request"],
  now = Date.now(),
): QueuedMutation[] {
  return [
    ...queue,
    {
      id: `${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      request,
      createdAt: now,
      attempts: 0,
      status: "pending",
    },
  ];
}

/** Next mutation to attempt: oldest pending, FIFO. */
export function next(queue: QueuedMutation[]): QueuedMutation | undefined {
  return queue.filter((m) => m.status === "pending").sort((a, b) => a.createdAt - b.createdAt)[0];
}

export type ReplayOutcome =
  | { ok: true }
  | { ok: false; status: number; message?: string };

/** Apply the result of a replay attempt to the queue. */
export function applyResult(
  queue: QueuedMutation[],
  id: string,
  outcome: ReplayOutcome,
  maxAttempts = 5,
): QueuedMutation[] {
  return queue.flatMap((m) => {
    if (m.id !== id) return [m];
    if (outcome.ok) return []; // done, drop it
    const attempts = m.attempts + 1;
    if (outcome.status === 409) {
      return [{ ...m, status: "conflict", attempts, lastError: "version conflict" }];
    }
    if (outcome.status >= 400 && outcome.status < 500 && outcome.status !== 429) {
      return [{ ...m, status: "failed", attempts, lastError: outcome.message ?? `HTTP ${outcome.status}` }];
    }
    if (attempts >= maxAttempts) {
      return [{ ...m, status: "failed", attempts, lastError: "max attempts" }];
    }
    return [{ ...m, status: "pending", attempts, lastError: outcome.message }];
  });
}

export interface SyncState {
  pending: number;
  conflicts: number;
  failed: number;
  idle: boolean;
}

export function syncState(queue: QueuedMutation[]): SyncState {
  const pending = queue.filter((m) => m.status === "pending" || m.status === "in_flight").length;
  return {
    pending,
    conflicts: queue.filter((m) => m.status === "conflict").length,
    failed: queue.filter((m) => m.status === "failed").length,
    idle: pending === 0,
  };
}

/** Drop a resolved conflict/failed entry (user dismissed or re-did the edit). */
export function discard(queue: QueuedMutation[], id: string): QueuedMutation[] {
  return queue.filter((m) => m.id !== id);
}
