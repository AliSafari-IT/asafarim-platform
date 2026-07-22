import type { modificationJobStatusEnum } from "../db/schema";

export type ModificationJobStatus = (typeof modificationJobStatusEnum.enumValues)[number];

export const TERMINAL_STATUSES: ReadonlySet<ModificationJobStatus> = new Set([
  "ready",
  "failed",
  "cancelled",
]);

export function isTerminal(status: ModificationJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The only legal forward-progress transitions for a conversational
 * modification job — a deliberately different shape from
 * lib/generation/stateMachine.ts's FORWARD_TRANSITIONS (see the
 * `modificationJobStatusEnum` doc comment in lib/db/schema.ts for why this
 * is a separate state machine rather than a shared one).
 * `awaiting_confirmation` is the one status generation jobs never have: a
 * destructive proposal pauses here for an explicit, actor-bound human
 * confirmation instead of being silently skipped.
 */
const FORWARD_TRANSITIONS: Record<ModificationJobStatus, readonly ModificationJobStatus[]> = {
  queued: ["interpreting"],
  interpreting: ["proposing"],
  // `proposing` is a PURE dry run (lib/modification/pipeline.ts's
  // runProposingPhase) — it computes the full diff/impact via the pure
  // engine without persisting anything. It moves straight to `applying`
  // when nothing proposed is destructive (nothing to gain by pausing for a
  // safe change), or pauses at `awaiting_confirmation` when a destructive
  // operation needs an explicit human decision first.
  proposing: ["awaiting_confirmation", "applying"],
  // Reached either immediately (nothing was destructive) or once a human
  // confirms — `applying` is the ONLY phase that ever calls the DB-backed,
  // capability-checked applyOperation (M04).
  awaiting_confirmation: ["applying"],
  applying: ["validating"],
  validating: ["preparing_preview"],
  preparing_preview: ["ready"],
  ready: [],
  failed: [],
  cancelled: [],
};

/**
 * True when `from -> to` is legal. A no-op (`from === to`) is never legal
 * here — heartbeat/phase updates are separate, lower-level writes that never
 * change `status` (see lib/repositories/modificationJobs.ts#heartbeat).
 */
export function canTransition(from: ModificationJobStatus, to: ModificationJobStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "cancelled" || to === "failed") return true;
  return FORWARD_TRANSITIONS[from].includes(to);
}

export class IllegalModificationStateTransitionError extends Error {
  constructor(
    public readonly from: ModificationJobStatus,
    public readonly to: ModificationJobStatus,
  ) {
    super(`Illegal modification job state transition: ${from} -> ${to}`);
    this.name = "IllegalModificationStateTransitionError";
  }
}

/** Throws unless `from -> to` is legal. The only place transition legality is decided for modification jobs. */
export function assertTransition(from: ModificationJobStatus, to: ModificationJobStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalModificationStateTransitionError(from, to);
  }
}
