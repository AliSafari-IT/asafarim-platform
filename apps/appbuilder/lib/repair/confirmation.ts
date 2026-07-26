import { checksumOf } from "../db/hash";
import { REPAIR_LIMITS } from "../validation/limits";
import type { repairAttempts } from "../db/schema";

type RepairAttemptRow = typeof repairAttempts.$inferSelect;

/**
 * Mirrors lib/modification/confirmation.ts exactly (binds to the exact
 * proposed operations a human reviewed) — deliberately a separate, small
 * implementation over `repairAttempts` rather than a shared generic module,
 * matching this codebase's existing convention of one confirmation
 * implementation per job table (see modificationJobs.ts's own docstring on
 * why generation/modification aren't unified either).
 */
export function computeRepairProposalChecksum(operations: unknown[]): string {
  return checksumOf({ operations });
}

export function repairConfirmationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + REPAIR_LIMITS.CONFIRMATION_TTL_MS);
}

export type RepairConfirmationFailureReason =
  | "not_required"
  | "already_confirmed"
  | "expired"
  | "checksum_mismatch"
  | "base_version_changed";

export function checkRepairConfirmation(
  attempt: RepairAttemptRow,
  input: { checksum: string; currentVersionNumber: number },
): RepairConfirmationFailureReason | null {
  if (!attempt.confirmationRequired) return "not_required";
  if (attempt.confirmationConfirmedAt) return "already_confirmed";
  if (!attempt.confirmationExpiresAt || attempt.confirmationExpiresAt.getTime() < Date.now()) return "expired";
  if (attempt.confirmationChecksum !== input.checksum) return "checksum_mismatch";
  if (attempt.confirmationBaseVersionNumber !== input.currentVersionNumber) return "base_version_changed";
  return null;
}
