import { checksumOf } from "../db/hash";
import { MODIFICATION_LIMITS } from "./limits";
import type { modificationJobs } from "../db/schema";

type ModificationJobRow = typeof modificationJobs.$inferSelect;

/**
 * Deterministic checksum binding a confirmation to the EXACT proposed
 * operations a human reviewed — never just "yes, apply whatever the batch
 * currently contains". Recomputed identically whenever the client needs to
 * display what will be applied and whenever the confirm endpoint verifies
 * it, so a proposal cannot be silently swapped between "shown to the user"
 * and "applied".
 */
export function computeProposalChecksum(operations: unknown[]): string {
  return checksumOf({ operations });
}

export function confirmationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + MODIFICATION_LIMITS.CONFIRMATION_TTL_MS);
}

export type ConfirmationFailureReason =
  | "not_required"
  | "already_confirmed"
  | "expired"
  | "checksum_mismatch"
  | "base_version_changed";

/**
 * Pure validation of a confirm request against the job's persisted
 * confirmation binding — issue requirement: "bind to actor, app, base
 * version, exact proposal checksum; expire; single-use ... fail if base
 * version changed; never come from the model." The caller (see
 * lib/repositories/modificationJobs.ts#confirmModification) is responsible
 * for the actor/app match (via assertCapability + comparing
 * initiatedByPrincipalId) and for atomically marking it consumed; this
 * function only decides whether a given attempt is valid right now.
 */
export function checkConfirmation(
  job: ModificationJobRow,
  input: { checksum: string; currentVersionNumber: number },
): ConfirmationFailureReason | null {
  if (!job.confirmationRequired) return "not_required";
  if (job.confirmationConfirmedAt) return "already_confirmed";
  if (!job.confirmationExpiresAt || job.confirmationExpiresAt.getTime() < Date.now()) return "expired";
  if (job.confirmationChecksum !== input.checksum) return "checksum_mismatch";
  if (job.confirmationBaseVersionNumber !== input.currentVersionNumber) return "base_version_changed";
  return null;
}
