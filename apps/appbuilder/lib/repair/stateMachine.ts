import type { repairAttemptStatusEnum } from "../db/schema";

export type RepairAttemptStatus = (typeof repairAttemptStatusEnum.enumValues)[number];

export const TERMINAL_STATUSES: ReadonlySet<RepairAttemptStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminal(status: RepairAttemptStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The bounded AI repair loop's own state machine — deliberately its own
 * shape (see lib/db/schema.ts's repairAttemptStatusEnum comment), reusing
 * M08's "propose -> dry-run -> confirm -> apply" shape
 * (lib/modification/stateMachine.ts) but adding `revalidating`: a repair is
 * never "done" merely because M04 accepted a new version — issue
 * requirement "no claim of success until a new persisted version passes all
 * gates" means the loop must re-enter validation from scratch before
 * `completed` is reachable at all.
 */
const FORWARD_TRANSITIONS: Record<RepairAttemptStatus, readonly RepairAttemptStatus[]> = {
  queued: ["classifying"],
  classifying: ["proposing"],
  // `proposing` is a pure dry run (lib/repair/pipeline.ts's runProposingPhase),
  // identical in shape to lib/modification/pipeline.ts's runProposingPhase.
  proposing: ["awaiting_confirmation", "applying"],
  awaiting_confirmation: ["applying"],
  applying: ["revalidating"],
  // `revalidating` creates and awaits a BRAND NEW validation run (never the
  // originating one) against the freshly applied version/preview; only that
  // new run reaching `passed` lets this attempt reach `completed`.
  revalidating: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: RepairAttemptStatus, to: RepairAttemptStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "cancelled" || to === "failed") return true;
  return FORWARD_TRANSITIONS[from].includes(to);
}

export class IllegalRepairStateTransitionError extends Error {
  constructor(
    public readonly from: RepairAttemptStatus,
    public readonly to: RepairAttemptStatus,
  ) {
    super(`Illegal repair attempt state transition: ${from} -> ${to}`);
    this.name = "IllegalRepairStateTransitionError";
  }
}

export function assertTransition(from: RepairAttemptStatus, to: RepairAttemptStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalRepairStateTransitionError(from, to);
  }
}
