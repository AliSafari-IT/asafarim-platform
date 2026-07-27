import { ConflictError } from "../errors";

/** A release's exact (version, checksum) does not currently satisfy every M11 eligibility requirement. See lib/deployment/eligibility.ts. */
export class ReleaseNotEligibleError extends ConflictError {
  constructor(public readonly reasons: readonly string[]) {
    super(`Release is not eligible for deployment: ${reasons.join("; ")}`);
    this.name = "ReleaseNotEligibleError";
  }
}

/** Approval was requested, but a fresh eligibility recheck no longer holds (e.g. the backing validation run was superseded/invalidated since preparation). The caller must re-prepare rather than force through a stale approval. */
export class StaleApprovalError extends ConflictError {
  constructor(public readonly reasons: readonly string[]) {
    super(`Approval is stale — this release is no longer eligible: ${reasons.join("; ")}. Prepare a fresh release for the current version.`);
    this.name = "StaleApprovalError";
  }
}

export class DeploymentLeaseLostError extends ConflictError {
  constructor(deploymentId: string) {
    super(`Lease on deployment ${deploymentId} was lost (reclaimed by another worker or deployment no longer active)`);
    this.name = "DeploymentLeaseLostError";
  }
}

export class StaleDeploymentStateError extends ConflictError {
  constructor(deploymentId: string, expected: string) {
    super(`Deployment ${deploymentId} was not in the expected state "${expected}" (concurrent update)`);
    this.name = "StaleDeploymentStateError";
  }
}

export class SlugReservationConflictError extends ConflictError {
  constructor(slug: string) {
    super(`"${slug}" cannot be used as a managed-app slug (reserved or already claimed by another app).`);
    this.name = "SlugReservationConflictError";
  }
}

/** A release/target does not belong to the app it was invoked against — never trust a client-supplied release id across app boundaries. */
export class CrossAppReleaseError extends ConflictError {
  constructor() {
    super("This release does not belong to the requested app.");
    this.name = "CrossAppReleaseError";
  }
}

export class RollbackTargetInvalidError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "RollbackTargetInvalidError";
  }
}
