import { and, asc, desc, eq, isNull, lt, ne, notInArray, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { modificationJobs, modificationOperationBatches, specifications } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, ForbiddenError, NotFoundError, StaleVersionError } from "../errors";
import {
  assertTransition,
  isTerminal,
  TERMINAL_STATUSES,
  type ModificationJobStatus,
} from "../modification/stateMachine";
import { MODIFICATION_LIMITS } from "../modification/limits";
import { checkConfirmation } from "../modification/confirmation";
import type { SelectionContextType } from "../modification/selectionContext";

export type ModificationJobRow = typeof modificationJobs.$inferSelect;
export type ModificationOperationBatchRow = typeof modificationOperationBatches.$inferSelect;

const TERMINAL_STATUS_LIST = [...TERMINAL_STATUSES] as ModificationJobStatus[];

export class ModificationLeaseLostError extends ConflictError {
  constructor(jobId: string) {
    super(`Lease on modification job ${jobId} was lost (reclaimed by another worker or job no longer active)`);
    this.name = "ModificationLeaseLostError";
  }
}

export class StaleModificationJobStateError extends ConflictError {
  constructor(jobId: string, expected: string) {
    super(`Modification job ${jobId} was not in the expected status "${expected}" (concurrent update)`);
    this.name = "StaleModificationJobStateError";
  }
}

export class ConfirmationExpiredError extends ConflictError {
  constructor() {
    super("The confirmation window for this change expired.");
    this.name = "ConfirmationExpiredError";
  }
}

export class ConfirmationInvalidError extends ConflictError {
  constructor(message = "This confirmation could not be verified.") {
    super(message);
    this.name = "ConfirmationInvalidError";
  }
}

// ─── Enqueue ────────────────────────────────────────────────────────────

export interface EnqueueModificationJobInput {
  conversationId: string;
  triggeringMessageId: string;
  userRequestText: string;
  selectionContext: SelectionContextType | null;
  idempotencyKey: string;
}

/**
 * Idempotently enqueues a conversational modification job. Mirrors
 * generationJobs.ts#enqueueGenerationJob's contract exactly (same-key
 * replay, active-job limits) — see lib/db/schema.ts's modificationJobs
 * comment for why this is a sibling table/state machine rather than a
 * generationJobs "jobType" discriminator.
 */
export async function enqueueModificationJob(
  db: Db,
  actor: Actor,
  appId: string,
  input: EnqueueModificationJobInput,
): Promise<ModificationJobRow> {
  await assertCapability(db, actor, appId, "app.requestModification");
  const requestHash = checksumOf({
    triggeringMessageId: input.triggeringMessageId,
    userRequestText: input.userRequestText,
    selectionContext: input.selectionContext,
  });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(modificationJobs)
      .where(and(eq(modificationJobs.appId, appId), eq(modificationJobs.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different modification request payload");
      }
      return existing;
    }

    const activeForApp = await tx
      .select({ id: modificationJobs.id })
      .from(modificationJobs)
      .where(and(eq(modificationJobs.appId, appId), notInArray(modificationJobs.status, TERMINAL_STATUS_LIST)));
    if (activeForApp.length >= MODIFICATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP) {
      throw new ConflictError(
        `This app already has ${activeForApp.length} active modification job(s) (limit ${MODIFICATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP}). Wait for it to finish, or cancel it first.`,
      );
    }

    const activeForUser = await tx
      .select({ id: modificationJobs.id })
      .from(modificationJobs)
      .where(
        and(
          eq(modificationJobs.initiatedByPrincipalId, actor.principalId),
          notInArray(modificationJobs.status, TERMINAL_STATUS_LIST),
        ),
      );
    if (activeForUser.length >= MODIFICATION_LIMITS.MAX_ACTIVE_JOBS_PER_USER) {
      throw new ConflictError(
        `You already have ${activeForUser.length} active modification job(s) across your apps (limit ${MODIFICATION_LIMITS.MAX_ACTIVE_JOBS_PER_USER}).`,
      );
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    const [job] = await tx
      .insert(modificationJobs)
      .values({
        id: generateId(),
        appId,
        conversationId: input.conversationId,
        triggeringMessageId: input.triggeringMessageId,
        initiatedByPrincipalId: actor.principalId,
        status: "queued",
        phase: "queued",
        idempotencyKey: input.idempotencyKey,
        requestHash,
        baseVersionNumber: spec.currentVersionNumber,
        selectionContext: input.selectionContext ?? undefined,
        userRequestText: input.userRequestText,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "modification.requested",
      targetType: "modification_job",
      targetId: job.id,
      metadata: { hasSelectionContext: input.selectionContext !== null },
    });

    return job;
  });
}

// ─── Claiming (worker-side, no Actor — see docs/appbuilder-m08-builder-workspace.md#modification-job-lifecycle) ──

export async function claimJobById(db: Db, jobId: string, workerId: string, leaseDurationMs: number): Promise<ModificationJobRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, eq(modificationJobs.id, jobId));
}

/**
 * Crash-recovery sweep path. Never claims a job awaiting human confirmation
 * (`awaiting_confirmation`) — that status only re-enters the claimable pool
 * once `confirmModification` explicitly clears the lease, exactly mirroring
 * generationJobs.ts's `needs_clarification` exclusion.
 */
export async function claimNextAvailableJob(db: Db, workerId: string, leaseDurationMs: number): Promise<ModificationJobRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, ne(modificationJobs.status, "awaiting_confirmation"));
}

async function claimInternal(
  db: Db,
  workerId: string,
  leaseDurationMs: number,
  extraCondition: SQL,
): Promise<ModificationJobRow | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const candidates = await tx
      .select()
      .from(modificationJobs)
      .where(
        and(
          notInArray(modificationJobs.status, TERMINAL_STATUS_LIST),
          or(isNull(modificationJobs.leaseExpiresAt), lt(modificationJobs.leaseExpiresAt, now)),
          extraCondition,
        ),
      )
      .orderBy(asc(modificationJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(modificationJobs)
      .set({
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        heartbeatAt: now,
        attemptCount: candidate.attemptCount + 1,
        updatedAt: now,
      })
      .where(eq(modificationJobs.id, candidate.id))
      .returning();

    return claimed;
  });
}

export async function heartbeat(db: Db, jobId: string, workerId: string, leaseDurationMs: number): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(modificationJobs)
    .set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs), updatedAt: now })
    .where(
      and(
        eq(modificationJobs.id, jobId),
        eq(modificationJobs.leaseOwner, workerId),
        notInArray(modificationJobs.status, TERMINAL_STATUS_LIST),
      ),
    )
    .returning({ id: modificationJobs.id });
  if (!updated) throw new ModificationLeaseLostError(jobId);
}

export async function releaseLease(db: Db, jobId: string, workerId: string): Promise<void> {
  await db
    .update(modificationJobs)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(modificationJobs.id, jobId), eq(modificationJobs.leaseOwner, workerId)));
}

// ─── Non-status field updates ───────────────────────────────────────────

export interface ModificationJobFieldPatch {
  phase?: string;
  normalizedRequest?: Record<string, unknown>;
  totalOperationsApplied?: number;
  providerName?: string;
  providerModel?: string;
  usage?: Record<string, unknown>;
}

export async function updateJobFields(db: Db, jobId: string, patch: ModificationJobFieldPatch): Promise<ModificationJobRow> {
  const [updated] = await db
    .update(modificationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(modificationJobs.id, jobId))
    .returning();
  if (!updated) throw new NotFoundError("Modification job", jobId);
  return updated;
}

// ─── Status transitions ────────────────────────────────────────────────

export interface ModificationTransitionPatch {
  phase?: string;
  normalizedRequest?: Record<string, unknown>;
  totalOperationsApplied?: number;
  confirmationRequired?: boolean;
  confirmationChecksum?: string;
  confirmationBaseVersionNumber?: number;
  confirmationExpiresAt?: Date;
  resultingVersionNumber?: number;
  resultingVersionId?: string;
  resultingPreviewBuildId?: string;
  providerName?: string;
  providerModel?: string;
  usage?: Record<string, unknown>;
  failureCode?: ModificationJobRow["failureCode"];
  failureMessage?: string;
}

export async function transitionStatus(
  db: Db,
  jobId: string,
  from: ModificationJobStatus,
  to: ModificationJobStatus,
  patch: ModificationTransitionPatch = {},
): Promise<ModificationJobRow> {
  assertTransition(from, to);
  const now = new Date();
  const values: Record<string, unknown> = { status: to, updatedAt: now, ...patch };
  if (from === "queued") values.startedAt = now;
  if (isTerminal(to)) values.completedAt = now;
  if (patch.phase === undefined) values.phase = to;

  const [updated] = await db
    .update(modificationJobs)
    .set(values)
    .where(and(eq(modificationJobs.id, jobId), eq(modificationJobs.status, from)))
    .returning();
  if (!updated) throw new StaleModificationJobStateError(jobId, from);
  return updated;
}

// ─── Cancellation ───────────────────────────────────────────────────────

/**
 * Mirrors generationJobs.ts#requestCancellation exactly. `queued` and
 * `awaiting_confirmation` (no in-flight worker step — the latter is
 * literally waiting on a human, not the worker) cancel immediately;
 * everything else is cooperative via `cancelRequestedAt`.
 */
export async function requestCancellation(db: Db, actor: Actor, appId: string, jobId: string): Promise<ModificationJobRow> {
  await assertCapability(db, actor, appId, "app.cancelModification");

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(modificationJobs)
      .where(and(eq(modificationJobs.id, jobId), eq(modificationJobs.appId, appId)))
      .for("update")
      .limit(1);
    if (!job) throw new NotFoundError("Modification job", jobId);

    if (job.status === "cancelled") return job;
    if (isTerminal(job.status)) {
      throw new ConflictError(`Modification job already finished with status "${job.status}"; it cannot be cancelled.`);
    }

    const now = new Date();
    if (job.status === "queued" || job.status === "awaiting_confirmation") {
      const [updated] = await tx
        .update(modificationJobs)
        .set({
          status: "cancelled",
          phase: "cancelled",
          cancelRequestedAt: now,
          cancelledByPrincipalId: actor.principalId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(modificationJobs.id, jobId))
        .returning();
      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "modification.cancelled",
        targetType: "modification_job",
        targetId: jobId,
        metadata: {},
      });
      return updated;
    }

    const [updated] = await tx
      .update(modificationJobs)
      .set({ cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, updatedAt: now })
      .where(eq(modificationJobs.id, jobId))
      .returning();
    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "modification.cancellation_requested",
      targetType: "modification_job",
      targetId: jobId,
      metadata: {},
    });
    return updated;
  });
}

export function isCancellationRequested(job: ModificationJobRow): boolean {
  return job.cancelRequestedAt !== null || job.status === "cancelled";
}

// ─── Confirmation ───────────────────────────────────────────────────────

export interface ConfirmModificationInput {
  checksum: string;
}

/**
 * Confirms a destructive proposal. Binds to actor (only the job's own
 * initiator may confirm — the AI never supplies or approves this), app,
 * base version (must equal the CURRENT specification version, not merely
 * the job's original base — a concurrent edit invalidates the confirmation
 * rather than being silently applied against a version the human never
 * saw), and the exact proposal checksum. Idempotently replayable: confirming
 * an already-confirmed job with the same checksum is a no-op returning the
 * same job; a different checksum on an already-confirmed job is rejected.
 * On success, transitions `awaiting_confirmation -> applying` itself
 * (mirrors generationJobs.ts#submitClarificationAnswers's own direct status
 * flip) and clears the lease so the worker picks it straight back up.
 */
type ConfirmModificationOutcome =
  | { kind: "ok"; job: ModificationJobRow }
  | { kind: "already_confirmed_replay"; job: ModificationJobRow }
  | { kind: "checksum_mismatch_on_confirmed" }
  | { kind: "expired"; currentVersionNumber: number }
  | { kind: "stale_base_version"; currentVersionNumber: number; expectedVersionNumber: number }
  | { kind: "checksum_mismatch" }
  | { kind: "invalid" };

/**
 * Confirms a destructive proposal. Binds to actor (only the job's own
 * initiator may confirm — the AI never supplies or approves this), app,
 * base version (must equal the CURRENT specification version, not merely
 * the job's original base — a concurrent edit invalidates the confirmation
 * rather than being silently applied against a version the human never
 * saw), and the exact proposal checksum. Idempotently replayable: confirming
 * an already-confirmed job with the same checksum is a no-op returning the
 * same job; a different checksum on an already-confirmed job is rejected.
 * On success, transitions `awaiting_confirmation -> applying` itself
 * (mirrors generationJobs.ts#submitClarificationAnswers's own direct status
 * flip) and clears the lease so the worker picks it straight back up.
 *
 * Structured as "run the whole decision inside one transaction that never
 * throws, then translate the result to an error afterward" rather than
 * throwing from inside the transaction callback — `db.transaction()` rolls
 * back everything written so far the moment its callback throws, which
 * would silently undo the very failed-status write this function needs to
 * persist for the expired/stale-version paths.
 */
export async function confirmModification(
  db: Db,
  actor: Actor,
  appId: string,
  jobId: string,
  input: ConfirmModificationInput,
): Promise<ModificationJobRow> {
  await assertCapability(db, actor, appId, "app.confirmModification");

  const outcome = await db.transaction(async (tx): Promise<ConfirmModificationOutcome> => {
    const [job] = await tx
      .select()
      .from(modificationJobs)
      .where(and(eq(modificationJobs.id, jobId), eq(modificationJobs.appId, appId)))
      .for("update")
      .limit(1);
    if (!job) throw new NotFoundError("Modification job", jobId);

    if (job.initiatedByPrincipalId !== actor.principalId) {
      throw new ForbiddenError("Only the person who requested this change can confirm it.");
    }

    if (job.confirmationConfirmedAt) {
      if (job.confirmationChecksum === input.checksum) return { kind: "already_confirmed_replay", job };
      return { kind: "checksum_mismatch_on_confirmed" };
    }

    if (job.status !== "awaiting_confirmation") {
      throw new ConflictError(`Modification job is not awaiting confirmation (status: ${job.status})`);
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    const reason = checkConfirmation(job, { checksum: input.checksum, currentVersionNumber: spec.currentVersionNumber });
    if (reason === "expired") {
      await tx
        .update(modificationJobs)
        .set({
          status: "failed",
          phase: "failed",
          failureCode: "confirmation_expired",
          failureMessage: "The confirmation window for this change expired.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(modificationJobs.id, jobId));
      return { kind: "expired", currentVersionNumber: spec.currentVersionNumber };
    }
    if (reason === "base_version_changed") {
      await tx
        .update(modificationJobs)
        .set({
          status: "failed",
          phase: "failed",
          failureCode: "stale_base_version",
          failureMessage: "The application was edited elsewhere while this change was awaiting confirmation.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(modificationJobs.id, jobId));
      return {
        kind: "stale_base_version",
        currentVersionNumber: spec.currentVersionNumber,
        expectedVersionNumber: job.confirmationBaseVersionNumber ?? job.baseVersionNumber,
      };
    }
    if (reason === "checksum_mismatch") {
      return { kind: "checksum_mismatch" };
    }
    if (reason === "not_required" || reason === "already_confirmed") {
      return { kind: "invalid" };
    }

    const now = new Date();
    const [updated] = await tx
      .update(modificationJobs)
      .set({
        status: "applying",
        phase: "applying:after_confirmation",
        confirmationConfirmedAt: now,
        confirmationConfirmedByPrincipalId: actor.principalId,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(modificationJobs.id, jobId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "modification.confirmed",
      targetType: "modification_job",
      targetId: jobId,
      metadata: {},
    });

    return { kind: "ok", job: updated };
  });

  switch (outcome.kind) {
    case "ok":
    case "already_confirmed_replay":
      return outcome.job;
    case "checksum_mismatch_on_confirmed":
      throw new ConfirmationInvalidError("This change was already confirmed with a different proposal.");
    case "expired":
      throw new ConfirmationExpiredError();
    case "stale_base_version":
      throw new StaleVersionError(outcome.currentVersionNumber, outcome.expectedVersionNumber);
    case "checksum_mismatch":
      throw new ConfirmationInvalidError("The proposal has changed since you last reviewed it. Refresh and try again.");
    case "invalid":
      throw new ConfirmationInvalidError();
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getModificationJobForActor(db: Db, actor: Actor, appId: string, jobId: string): Promise<ModificationJobRow> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  const [job] = await db
    .select()
    .from(modificationJobs)
    .where(and(eq(modificationJobs.id, jobId), eq(modificationJobs.appId, appId)))
    .limit(1);
  if (!job) throw new NotFoundError("Modification job", jobId);
  return job;
}

/** Most recent modification job for an app (any status) — for reconnect/resume after refresh. */
export async function getLatestModificationJobForActor(db: Db, actor: Actor, appId: string): Promise<ModificationJobRow | null> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  const [row] = await db
    .select()
    .from(modificationJobs)
    .where(eq(modificationJobs.appId, appId))
    .orderBy(desc(modificationJobs.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Looks up a job by its enqueue idempotency key — lets the "send message"
 * API route detect a retried HTTP request (network retry, double submit)
 * BEFORE creating a second conversation message, not just before creating a
 * second job. See app/api/apps/[appId]/conversation/messages/route.ts.
 */
export async function getModificationJobByIdempotencyKey(
  db: Db,
  actor: Actor,
  appId: string,
  idempotencyKey: string,
): Promise<ModificationJobRow | null> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  const [row] = await db
    .select()
    .from(modificationJobs)
    .where(and(eq(modificationJobs.appId, appId), eq(modificationJobs.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export async function getOperationBatchForActor(
  db: Db,
  actor: Actor,
  appId: string,
  jobId: string,
): Promise<ModificationOperationBatchRow | null> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  const [row] = await db
    .select()
    .from(modificationOperationBatches)
    .where(and(eq(modificationOperationBatches.jobId, jobId), eq(modificationOperationBatches.appId, appId)))
    .limit(1);
  return row ?? null;
}
