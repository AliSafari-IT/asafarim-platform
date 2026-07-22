import type { generationJobStatusEnum } from "../db/schema";

export type GenerationJobStatus = (typeof generationJobStatusEnum.enumValues)[number];

export const TERMINAL_STATUSES: ReadonlySet<GenerationJobStatus> = new Set([
  "ready",
  "failed",
  "cancelled",
]);

export function isTerminal(status: GenerationJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The only legal *forward-progress* transitions — everything else (jumping
 * straight from `queued` to `ready`, going backward from `validating` to
 * `analyzing`, re-entering a terminal status) is illegal regardless of who
 * asks for it. `cancelled`/`failed` are handled separately below since they
 * are reachable from every non-terminal status, not just specific ones.
 */
const FORWARD_TRANSITIONS: Record<GenerationJobStatus, readonly GenerationJobStatus[]> = {
  queued: ["analyzing"],
  analyzing: ["needs_clarification", "planning"],
  // Resuming after an owner/editor answers: back to analyzing to
  // re-interpret the request with the new answers folded in.
  needs_clarification: ["analyzing"],
  planning: ["applying"],
  // applying loops back to planning for the next iteration, or moves on to
  // validating once the model reports isFinalBatch (or the operation
  // budget/iteration cap is reached).
  applying: ["planning", "validating"],
  validating: ["preparing_preview"],
  preparing_preview: ["ready"],
  ready: [],
  failed: [],
  cancelled: [],
};

/**
 * True when `from -> to` is a legal transition. A no-op (`from === to`) is
 * never legal here — heartbeat/phase updates are separate, lower-level
 * writes that never change `status` (see
 * lib/repositories/generationJobs.ts#heartbeat) and must not be confused
 * with a state transition.
 */
export function canTransition(from: GenerationJobStatus, to: GenerationJobStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "cancelled" || to === "failed") return true;
  return FORWARD_TRANSITIONS[from].includes(to);
}

export class IllegalStateTransitionError extends Error {
  constructor(
    public readonly from: GenerationJobStatus,
    public readonly to: GenerationJobStatus,
  ) {
    super(`Illegal generation job state transition: ${from} -> ${to}`);
    this.name = "IllegalStateTransitionError";
  }
}

/** Throws IllegalStateTransitionError unless `from -> to` is legal. The only place transition legality is decided — callers never branch on status strings themselves. */
export function assertTransition(from: GenerationJobStatus, to: GenerationJobStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}
