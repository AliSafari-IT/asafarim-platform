import type { validationRunStatusEnum } from "../db/schema";

export type ValidationRunStatus = (typeof validationRunStatusEnum.enumValues)[number];

/**
 * `pending`/`running` are non-terminal; every other status is terminal — a
 * run's pinned identity and terminal gate results/artifacts are never
 * revised after this, only read (see lib/db/schema.ts's validationRuns
 * comment). `flaky` and `infrastructure_error` are DELIBERATELY distinct
 * terminal outcomes from `failed`: both mean "we do not have a trustworthy
 * pass/fail verdict", never "the app is broken" — see
 * lib/repair/classify.ts, which refuses to attempt a repair for either.
 */
export const TERMINAL_STATUSES: ReadonlySet<ValidationRunStatus> = new Set([
  "passed",
  "failed",
  "infrastructure_error",
  "flaky",
  "cancelled",
]);

export function isTerminal(status: ValidationRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const FORWARD_TRANSITIONS: Record<ValidationRunStatus, readonly ValidationRunStatus[]> = {
  pending: ["running"],
  running: ["passed", "failed", "infrastructure_error", "flaky"],
  passed: [],
  failed: [],
  infrastructure_error: [],
  flaky: [],
  cancelled: [],
};

/** True when `from -> to` is legal. A no-op (`from === to`) is never legal — heartbeat/gate-result writes are separate, lower-level writes that never change the run's own `status`. */
export function canTransition(from: ValidationRunStatus, to: ValidationRunStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "cancelled") return true;
  return FORWARD_TRANSITIONS[from].includes(to);
}

export class IllegalValidationRunTransitionError extends Error {
  constructor(
    public readonly from: ValidationRunStatus,
    public readonly to: ValidationRunStatus,
  ) {
    super(`Illegal validation run state transition: ${from} -> ${to}`);
    this.name = "IllegalValidationRunTransitionError";
  }
}

/** Throws unless `from -> to` is legal. The only place transition legality is decided for validation runs. */
export function assertTransition(from: ValidationRunStatus, to: ValidationRunStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalValidationRunTransitionError(from, to);
  }
}
