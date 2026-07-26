import { and, asc, desc, eq, isNull, lt, notInArray, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { repairAttempts, specifications, validationRuns } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, ForbiddenError, NotFoundError, StaleVersionError } from "../errors";
import { assertTransition, isTerminal, TERMINAL_STATUSES, type RepairAttemptStatus } from "../repair/stateMachine";
import { REPAIR_LIMITS } from "../validation/limits";
import { checkRepairConfirmation } from "../repair/confirmation";

export type RepairAttemptRow = typeof repairAttempts.$inferSelect;

const TERMINAL_STATUS_LIST = [...TERMINAL_STATUSES] as RepairAttemptStatus[];

export class RepairAttemptLeaseLostError extends ConflictError {
  constructor(attemptId: string) {
    super(`Lease on repair attempt ${attemptId} was lost (reclaimed by another worker or attempt no longer active)`);
    this.name = "RepairAttemptLeaseLostError";
  }
}

export class StaleRepairAttemptStateError extends ConflictError {
  constructor(attemptId: string, expected: string) {
    super(`Repair attempt ${attemptId} was not in the expected status "${expected}" (concurrent update)`);
    this.name = "StaleRepairAttemptStateError";
  }
}

export class RepairConfirmationExpiredError extends ConflictError {
  constructor() {
    super("The confirmation window for this repair expired.");
    this.name = "RepairConfirmationExpiredError";
  }
}

export class RepairConfirmationInvalidError extends ConflictError {
  constructor(message = "This confirmation could not be verified.") {
    super(message);
    this.name = "RepairConfirmationInvalidError";
  }
}

// ─── Enqueue ────────────────────────────────────────────────────────────

export interface EnqueueRepairAttemptInput {
  originatingRunId: string;
  idempotencyKey: string;
}

/**
 * Idempotently creates a bounded repair attempt against a FAILED validation
 * run. Enforces `MAX_REPAIR_ATTEMPTS_PER_RUN` in application logic AND
 * structurally via the `(originatingRunId, attemptNumber)` unique index
 * (lib/db/schema.ts#repairAttempts) — a race between two concurrent
 * enqueue calls fails closed at the database, never silently exceeding the
 * budget.
 */
export async function enqueueRepairAttempt(db: Db, actor: Actor, appId: string, input: EnqueueRepairAttemptInput): Promise<RepairAttemptRow> {
  await assertCapability(db, actor, appId, "app.requestRepair");
  const requestHash = checksumOf({ appId, originatingRunId: input.originatingRunId });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(repairAttempts)
      .where(and(eq(repairAttempts.appId, appId), eq(repairAttempts.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different repair request payload");
      }
      return existing;
    }

    const [run] = await tx.select().from(validationRuns).where(and(eq(validationRuns.id, input.originatingRunId), eq(validationRuns.appId, appId))).limit(1);
    if (!run) throw new NotFoundError("Validation run", input.originatingRunId);
    if (run.status !== "failed") {
      throw new ConflictError(`A repair can only be requested against a "failed" validation run (current status: "${run.status}").`);
    }

    const priorAttempts = await tx
      .select({ id: repairAttempts.id })
      .from(repairAttempts)
      .where(eq(repairAttempts.originatingRunId, input.originatingRunId));
    if (priorAttempts.length >= REPAIR_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN) {
      throw new ConflictError(
        `This validation run already has ${priorAttempts.length} repair attempt(s) (limit ${REPAIR_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN}). Fix the remaining failure(s) manually instead.`,
      );
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    const [attempt] = await tx
      .insert(repairAttempts)
      .values({
        id: generateId(),
        appId,
        originatingRunId: input.originatingRunId,
        attemptNumber: priorAttempts.length + 1,
        initiatedByPrincipalId: actor.principalId,
        status: "queued",
        phase: "queued",
        baseVersionNumber: spec.currentVersionNumber,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "repair.requested",
      targetType: "repair_attempt",
      targetId: attempt.id,
      metadata: { originatingRunId: input.originatingRunId, attemptNumber: attempt.attemptNumber },
    });

    return attempt;
  });
}

// ─── Claiming ───────────────────────────────────────────────────────────

export async function claimAttemptById(db: Db, attemptId: string, workerId: string, leaseDurationMs: number): Promise<RepairAttemptRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, eq(repairAttempts.id, attemptId));
}

/** Crash-recovery sweep path. Never claims a repair attempt awaiting human confirmation — mirrors modificationJobs.ts's `claimNextAvailableJob` exactly; that status only re-enters the claimable pool once `confirmRepair` explicitly clears the lease. */
export async function claimNextAvailableAttempt(db: Db, workerId: string, leaseDurationMs: number): Promise<RepairAttemptRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, notInArray(repairAttempts.status, ["awaiting_confirmation"] as RepairAttemptStatus[]));
}

async function claimInternal(db: Db, workerId: string, leaseDurationMs: number, extraCondition: SQL): Promise<RepairAttemptRow | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const candidates = await tx
      .select()
      .from(repairAttempts)
      .where(
        and(
          notInArray(repairAttempts.status, TERMINAL_STATUS_LIST),
          or(isNull(repairAttempts.leaseExpiresAt), lt(repairAttempts.leaseExpiresAt, now)),
          extraCondition,
        ),
      )
      .orderBy(asc(repairAttempts.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(repairAttempts)
      .set({ leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs), heartbeatAt: now, updatedAt: now })
      .where(eq(repairAttempts.id, candidate.id))
      .returning();
    return claimed;
  });
}

export async function heartbeat(db: Db, attemptId: string, workerId: string, leaseDurationMs: number): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(repairAttempts)
    .set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs), updatedAt: now })
    .where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.leaseOwner, workerId), notInArray(repairAttempts.status, TERMINAL_STATUS_LIST)))
    .returning({ id: repairAttempts.id });
  if (!updated) throw new RepairAttemptLeaseLostError(attemptId);
}

export async function releaseLease(db: Db, attemptId: string, workerId: string): Promise<void> {
  await db
    .update(repairAttempts)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.leaseOwner, workerId)));
}

// ─── Status transitions ─────────────────────────────────────────────────

export interface RepairAttemptTransitionPatch {
  phase?: string;
  failureClassification?: RepairAttemptRow["failureClassification"];
  targetGateKeys?: string[];
  diagnosticsSummary?: Record<string, unknown>;
  proposedOperationCount?: number;
  rejectedOperations?: Record<string, unknown>[];
  destructiveOperations?: Record<string, unknown>[];
  appliedOperationIds?: string[];
  confirmationRequired?: boolean;
  confirmationChecksum?: string;
  confirmationBaseVersionNumber?: number;
  confirmationExpiresAt?: Date;
  resultingVersionNumber?: number;
  resultingVersionId?: string;
  resultingPreviewBuildId?: string;
  resultingValidationRunId?: string;
  providerName?: string;
  providerModel?: string;
  usage?: Record<string, unknown>;
  failureCode?: RepairAttemptRow["failureCode"];
  failureMessage?: string;
}

export async function transitionStatus(
  db: Db,
  attemptId: string,
  from: RepairAttemptStatus,
  to: RepairAttemptStatus,
  patch: RepairAttemptTransitionPatch = {},
): Promise<RepairAttemptRow> {
  assertTransition(from, to);
  const now = new Date();
  const values: Record<string, unknown> = { status: to, updatedAt: now, ...patch };
  if (from === "queued") values.startedAt = now;
  if (isTerminal(to)) values.completedAt = now;
  if (patch.phase === undefined) values.phase = to;

  const [updated] = await db
    .update(repairAttempts)
    .set(values)
    .where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.status, from)))
    .returning();
  if (!updated) throw new StaleRepairAttemptStateError(attemptId, from);
  return updated;
}

export async function updateAttemptFields(db: Db, attemptId: string, patch: RepairAttemptTransitionPatch): Promise<RepairAttemptRow> {
  const [updated] = await db
    .update(repairAttempts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(repairAttempts.id, attemptId))
    .returning();
  if (!updated) throw new NotFoundError("Repair attempt", attemptId);
  return updated;
}

// ─── Cancellation ───────────────────────────────────────────────────────

export async function requestCancellation(db: Db, actor: Actor, appId: string, attemptId: string): Promise<RepairAttemptRow> {
  await assertCapability(db, actor, appId, "app.cancelRepair");

  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(repairAttempts)
      .where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.appId, appId)))
      .for("update")
      .limit(1);
    if (!attempt) throw new NotFoundError("Repair attempt", attemptId);

    if (attempt.status === "cancelled") return attempt;
    if (isTerminal(attempt.status)) {
      throw new ConflictError(`Repair attempt already finished with status "${attempt.status}"; it cannot be cancelled.`);
    }

    const now = new Date();
    if (attempt.status === "queued" || attempt.status === "awaiting_confirmation") {
      const [updated] = await tx
        .update(repairAttempts)
        .set({ status: "cancelled", phase: "cancelled", cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, completedAt: now, updatedAt: now })
        .where(eq(repairAttempts.id, attemptId))
        .returning();
      await recordAuditEvent(tx, { appId, actorPrincipalId: actor.principalId, action: "repair.cancelled", targetType: "repair_attempt", targetId: attemptId, metadata: {} });
      return updated;
    }

    const [updated] = await tx
      .update(repairAttempts)
      .set({ cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, updatedAt: now })
      .where(eq(repairAttempts.id, attemptId))
      .returning();
    await recordAuditEvent(tx, { appId, actorPrincipalId: actor.principalId, action: "repair.cancellation_requested", targetType: "repair_attempt", targetId: attemptId, metadata: {} });
    return updated;
  });
}

export function isCancellationRequested(attempt: RepairAttemptRow): boolean {
  return attempt.cancelRequestedAt !== null || attempt.status === "cancelled";
}

// ─── Confirmation ───────────────────────────────────────────────────────

export interface ConfirmRepairInput {
  checksum: string;
}

/** Mirrors lib/repositories/modificationJobs.ts#confirmModification exactly, over repairAttempts instead. */
export async function confirmRepair(db: Db, actor: Actor, appId: string, attemptId: string, input: ConfirmRepairInput): Promise<RepairAttemptRow> {
  await assertCapability(db, actor, appId, "app.confirmRepair");

  type Outcome =
    | { kind: "ok"; attempt: RepairAttemptRow }
    | { kind: "already_confirmed_replay"; attempt: RepairAttemptRow }
    | { kind: "checksum_mismatch_on_confirmed" }
    | { kind: "expired"; currentVersionNumber: number }
    | { kind: "stale_base_version"; currentVersionNumber: number; expectedVersionNumber: number }
    | { kind: "checksum_mismatch" }
    | { kind: "invalid" };

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const [attempt] = await tx
      .select()
      .from(repairAttempts)
      .where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.appId, appId)))
      .for("update")
      .limit(1);
    if (!attempt) throw new NotFoundError("Repair attempt", attemptId);

    if (attempt.initiatedByPrincipalId !== actor.principalId) {
      throw new ForbiddenError("Only the person who requested this repair can confirm it.");
    }

    if (attempt.confirmationConfirmedAt) {
      if (attempt.confirmationChecksum === input.checksum) return { kind: "already_confirmed_replay", attempt };
      return { kind: "checksum_mismatch_on_confirmed" };
    }

    if (attempt.status !== "awaiting_confirmation") {
      throw new ConflictError(`Repair attempt is not awaiting confirmation (status: ${attempt.status})`);
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    const reason = checkRepairConfirmation(attempt, { checksum: input.checksum, currentVersionNumber: spec.currentVersionNumber });
    if (reason === "expired") {
      await tx
        .update(repairAttempts)
        .set({ status: "failed", phase: "failed", failureCode: "confirmation_expired", failureMessage: "The confirmation window for this repair expired.", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(repairAttempts.id, attemptId));
      return { kind: "expired", currentVersionNumber: spec.currentVersionNumber };
    }
    if (reason === "base_version_changed") {
      await tx
        .update(repairAttempts)
        .set({ status: "failed", phase: "failed", failureCode: "stale_base_version", failureMessage: "The application was edited elsewhere while this repair was awaiting confirmation.", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(repairAttempts.id, attemptId));
      return { kind: "stale_base_version", currentVersionNumber: spec.currentVersionNumber, expectedVersionNumber: attempt.confirmationBaseVersionNumber ?? attempt.baseVersionNumber };
    }
    if (reason === "checksum_mismatch") return { kind: "checksum_mismatch" };
    if (reason === "not_required" || reason === "already_confirmed") return { kind: "invalid" };

    const now = new Date();
    const [updated] = await tx
      .update(repairAttempts)
      .set({ status: "applying", phase: "applying:after_confirmation", confirmationConfirmedAt: now, confirmationConfirmedByPrincipalId: actor.principalId, leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
      .where(eq(repairAttempts.id, attemptId))
      .returning();

    await recordAuditEvent(tx, { appId, actorPrincipalId: actor.principalId, action: "repair.confirmed", targetType: "repair_attempt", targetId: attemptId, metadata: {} });
    return { kind: "ok", attempt: updated };
  });

  switch (outcome.kind) {
    case "ok":
    case "already_confirmed_replay":
      return outcome.attempt;
    case "checksum_mismatch_on_confirmed":
      throw new RepairConfirmationInvalidError("This repair was already confirmed with a different proposal.");
    case "expired":
      throw new RepairConfirmationExpiredError();
    case "stale_base_version":
      throw new StaleVersionError(outcome.currentVersionNumber, outcome.expectedVersionNumber);
    case "checksum_mismatch":
      throw new RepairConfirmationInvalidError("The proposal has changed since you last reviewed it. Refresh and try again.");
    case "invalid":
      throw new RepairConfirmationInvalidError();
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getRepairAttemptForActor(db: Db, actor: Actor, appId: string, attemptId: string): Promise<RepairAttemptRow> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  const [attempt] = await db.select().from(repairAttempts).where(and(eq(repairAttempts.id, attemptId), eq(repairAttempts.appId, appId))).limit(1);
  if (!attempt) throw new NotFoundError("Repair attempt", attemptId);
  return attempt;
}

export async function listRepairAttemptsForRun(db: Db, actor: Actor, appId: string, originatingRunId: string): Promise<RepairAttemptRow[]> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  return db
    .select()
    .from(repairAttempts)
    .where(and(eq(repairAttempts.appId, appId), eq(repairAttempts.originatingRunId, originatingRunId)))
    .orderBy(asc(repairAttempts.attemptNumber));
}

export async function listRepairAttemptsForApp(db: Db, actor: Actor, appId: string, limit = 20): Promise<RepairAttemptRow[]> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  return db.select().from(repairAttempts).where(eq(repairAttempts.appId, appId)).orderBy(desc(repairAttempts.createdAt)).limit(limit);
}
