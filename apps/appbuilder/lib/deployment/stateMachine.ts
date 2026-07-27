import type { deploymentPhaseEnum, deploymentStatusEnum } from "../db/schema";

export type DeploymentStatus = (typeof deploymentStatusEnum.enumValues)[number];
export type DeploymentPhase = (typeof deploymentPhaseEnum.enumValues)[number];

/** `pending`/`running` are non-terminal; every other status is a terminal, protected outcome — mirrors lib/validation/stateMachine.ts. */
export const TERMINAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set(["succeeded", "failed", "cancelled", "rolled_back"]);

export function isTerminalStatus(status: DeploymentStatus): boolean {
  return TERMINAL_DEPLOYMENT_STATUSES.has(status);
}

const FORWARD_STATUS_TRANSITIONS: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  pending: ["running"],
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
  cancelled: [],
  rolled_back: [],
};

export function canTransitionStatus(from: DeploymentStatus, to: DeploymentStatus): boolean {
  if (from === to) return false;
  if (isTerminalStatus(from)) return false;
  if (to === "cancelled") return true;
  return FORWARD_STATUS_TRANSITIONS[from].includes(to);
}

export class IllegalDeploymentStatusTransitionError extends Error {
  constructor(
    public readonly from: DeploymentStatus,
    public readonly to: DeploymentStatus,
  ) {
    super(`Illegal deployment status transition: ${from} -> ${to}`);
    this.name = "IllegalDeploymentStatusTransitionError";
  }
}

export function assertStatusTransition(from: DeploymentStatus, to: DeploymentStatus): void {
  if (!canTransitionStatus(from, to)) {
    throw new IllegalDeploymentStatusTransitionError(from, to);
  }
}

/**
 * The deployment pipeline's phases, in the exact order lib/deployment/pipeline.ts
 * executes them. Everything up to and including `smoke_testing` is
 * PRE-ACTIVATION and must leave the previous production release untouched on
 * failure; `activating` is the single atomic pointer switch; `verifying`
 * runs after activation and, on failure, triggers an automatic restore of
 * the previous healthy pointer. `rolling_back` is a distinct phase only a
 * rollback deployment ever enters (in place of the forward-deploy phases
 * before it).
 */
export const DEPLOYMENT_PHASE_ORDER: readonly DeploymentPhase[] = [
  "queued",
  "checking_eligibility",
  "freezing_manifest",
  "reserving_slug",
  "checking_data_compatibility",
  "preparing_artifact",
  "publishing",
  "health_checking",
  "smoke_testing",
  "activating",
  "verifying",
  "completed",
];

/** The last phase before the production pointer moves. A failure at or before this phase must never touch `app_domains.activeReleaseId`. */
export const LAST_PRE_ACTIVATION_PHASE: DeploymentPhase = "smoke_testing";

export function nextPhaseAfter(phase: DeploymentPhase): DeploymentPhase | null {
  if (phase === "rolling_back") return null;
  const index = DEPLOYMENT_PHASE_ORDER.indexOf(phase);
  if (index === -1 || index === DEPLOYMENT_PHASE_ORDER.length - 1) return null;
  return DEPLOYMENT_PHASE_ORDER[index + 1];
}

export function isPreActivationPhase(phase: DeploymentPhase): boolean {
  const index = DEPLOYMENT_PHASE_ORDER.indexOf(phase);
  const activationIndex = DEPLOYMENT_PHASE_ORDER.indexOf("activating");
  return index !== -1 && index < activationIndex;
}
