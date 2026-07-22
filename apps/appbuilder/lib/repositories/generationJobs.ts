import { and, asc, desc, eq, isNull, lt, ne, notInArray, or, type SQL } from "drizzle-orm";
import { ClarificationState, type ClarificationAnswerType, type ClarificationRoundType } from "@asafarim/appbuilder-ai";
import type { Db } from "../db/client";
import { generationJobs, generationOperationBatches, specifications } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, NotFoundError } from "../errors";
import {
  assertTransition,
  isTerminal,
  TERMINAL_STATUSES,
  type GenerationJobStatus,
} from "../generation/stateMachine";
import { GENERATION_LIMITS } from "../generation/limits";

export type GenerationJobRow = typeof generationJobs.$inferSelect;
export type GenerationOperationBatchRow = typeof generationOperationBatches.$inferSelect;

const TERMINAL_STATUS_LIST = [...TERMINAL_STATUSES] as GenerationJobStatus[];

export class LeaseLostError extends ConflictError {
  constructor(jobId: string) {
    super(`Lease on generation job ${jobId} was lost (reclaimed by another worker or job no longer active)`);
    this.name = "LeaseLostError";
  }
}

export class StaleJobStateError extends ConflictError {
  constructor(jobId: string, expected: string) {
    super(`Generation job ${jobId} was not in the expected status "${expected}" (concurrent update)`);
    this.name = "StaleJobStateError";
  }
}

// ─── Enqueue ────────────────────────────────────────────────────────────

export interface EnqueueGenerationJobInput {
  creationRequestId: string;
  requestedTemplateId: string;
  idempotencyKey: string;
}

/**
 * Idempotently enqueues a generation job. Retrying with the same
 * `(appId, idempotencyKey)` always returns the existing job unchanged; the
 * same key with a different `requestedTemplateId`/`creationRequestId` is a
 * `ConflictError`. Enforces the M07 per-app and per-user active-job limits
 * (see GENERATION_LIMITS) before inserting — a caller must cancel or wait
 * for an existing job to finish before starting another.
 */
export async function enqueueGenerationJob(
  db: Db,
  actor: Actor,
  appId: string,
  input: EnqueueGenerationJobInput,
): Promise<GenerationJobRow> {
  await assertCapability(db, actor, appId, "app.requestGeneration");
  const requestHash = checksumOf({
    creationRequestId: input.creationRequestId,
    requestedTemplateId: input.requestedTemplateId,
  });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.appId, appId), eq(generationJobs.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different generation request payload");
      }
      return existing;
    }

    const activeForApp = await tx
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(and(eq(generationJobs.appId, appId), notInArray(generationJobs.status, TERMINAL_STATUS_LIST)));
    if (activeForApp.length >= GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP) {
      throw new ConflictError(
        `This app already has ${activeForApp.length} active generation job(s) (limit ${GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP}). Cancel or wait for it to finish first.`,
      );
    }

    const activeForUser = await tx
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.initiatedByPrincipalId, actor.principalId),
          notInArray(generationJobs.status, TERMINAL_STATUS_LIST),
        ),
      );
    if (activeForUser.length >= GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_USER) {
      throw new ConflictError(
        `You already have ${activeForUser.length} active generation job(s) across your apps (limit ${GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_USER}).`,
      );
    }

    const [spec] = await tx.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
    if (!spec) throw new NotFoundError("Specification for app", appId);

    const [job] = await tx
      .insert(generationJobs)
      .values({
        id: generateId(),
        appId,
        creationRequestId: input.creationRequestId,
        initiatedByPrincipalId: actor.principalId,
        status: "queued",
        phase: "queued",
        idempotencyKey: input.idempotencyKey,
        requestHash,
        baseVersionNumber: spec.currentVersionNumber,
        requestedTemplateId: input.requestedTemplateId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generation.requested",
      targetType: "generation_job",
      targetId: job.id,
      metadata: { requestedTemplateId: input.requestedTemplateId },
    });

    return job;
  });
}

// ─── Claiming (worker-side, no Actor — see docs/appbuilder-m07-ai-generation.md#trusted-actor-model) ──

/**
 * Atomically claims a job the worker already knows about (from the BullMQ
 * job payload) — the fast path for normal, healthy dispatch. Only succeeds
 * if the job is not currently leased by a live lease. Uses `SELECT ... FOR
 * UPDATE SKIP LOCKED` so two worker processes racing on the same jobId
 * never both succeed (one gets the row lock, the other's SKIP LOCKED read
 * sees nothing and returns null rather than blocking).
 */
export async function claimJobById(db: Db, jobId: string, workerId: string, leaseDurationMs: number): Promise<GenerationJobRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, eq(generationJobs.id, jobId));
}

/**
 * The crash-recovery path: polls for ANY claimable job (no specific id),
 * oldest first — picks up jobs whose BullMQ dispatch message was lost
 * (e.g. a Redis restart without persistence) or whose previous worker died
 * mid-processing without releasing its lease (lease has since expired).
 * Never claims a job awaiting human input (`needs_clarification`) — that
 * status is only re-entered into the claimable pool by
 * `submitClarificationAnswers`, which explicitly clears the lease.
 */
export async function claimNextAvailableJob(db: Db, workerId: string, leaseDurationMs: number): Promise<GenerationJobRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, ne(generationJobs.status, "needs_clarification"));
}

async function claimInternal(
  db: Db,
  workerId: string,
  leaseDurationMs: number,
  extraCondition: SQL,
): Promise<GenerationJobRow | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const candidates = await tx
      .select()
      .from(generationJobs)
      .where(
        and(
          notInArray(generationJobs.status, TERMINAL_STATUS_LIST),
          or(isNull(generationJobs.leaseExpiresAt), lt(generationJobs.leaseExpiresAt, now)),
          extraCondition,
        ),
      )
      .orderBy(asc(generationJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(generationJobs)
      .set({
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        heartbeatAt: now,
        attemptCount: candidate.attemptCount + 1,
        updatedAt: now,
      })
      .where(eq(generationJobs.id, candidate.id))
      .returning();

    return claimed;
  });
}

/**
 * Refreshes an in-progress worker's lease. Throws `LeaseLostError` if this
 * worker no longer owns the lease (reclaimed after this worker's previous
 * lease expired) or the job has since reached a terminal status — the
 * caller must stop processing immediately rather than keep working on a
 * job another worker may already be handling (avoids double-apply/
 * split-brain).
 */
export async function heartbeat(db: Db, jobId: string, workerId: string, leaseDurationMs: number): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(generationJobs)
    .set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseDurationMs), updatedAt: now })
    .where(
      and(
        eq(generationJobs.id, jobId),
        eq(generationJobs.leaseOwner, workerId),
        notInArray(generationJobs.status, TERMINAL_STATUS_LIST),
      ),
    )
    .returning({ id: generationJobs.id });
  if (!updated) throw new LeaseLostError(jobId);
}

/** Releases a worker's lease without changing status — used when a job is being requeued (e.g. after applying a batch, before the next iteration) rather than actively processed. */
export async function releaseLease(db: Db, jobId: string, workerId: string): Promise<void> {
  await db
    .update(generationJobs)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.leaseOwner, workerId)));
}

// ─── Non-status field updates ───────────────────────────────────────────

export interface JobFieldPatch {
  phase?: string;
  selectedTemplateId?: string;
  templateSelection?: Record<string, unknown>;
  normalizedRequirements?: Record<string, unknown>;
  clarificationState?: Record<string, unknown>;
  totalOperationsApplied?: number;
  providerName?: string;
  providerModel?: string;
  usage?: Record<string, unknown>;
}

/**
 * Updates job bookkeeping fields WITHOUT changing `status` — for progress
 * that happens mid-phase (e.g. recording the selected template, or
 * incrementing `totalOperationsApplied` after each operation lands) where
 * `transitionStatus`'s `from !== to` requirement would otherwise get in the
 * way. Never touches `status`; use `transitionStatus` for that.
 */
export async function updateJobFields(db: Db, jobId: string, patch: JobFieldPatch): Promise<GenerationJobRow> {
  const [updated] = await db
    .update(generationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId))
    .returning();
  if (!updated) throw new NotFoundError("Generation job", jobId);
  return updated;
}

// ─── Status transitions ────────────────────────────────────────────────

export interface TransitionPatch {
  phase?: string;
  baseVersionNumber?: number;
  selectedTemplateId?: string;
  templateSelection?: Record<string, unknown>;
  normalizedRequirements?: Record<string, unknown>;
  clarificationState?: Record<string, unknown>;
  totalOperationsApplied?: number;
  resultingVersionNumber?: number;
  resultingVersionId?: string;
  resultingPreviewBuildId?: string;
  providerName?: string;
  providerModel?: string;
  usage?: Record<string, unknown>;
  failureCode?: GenerationJobRow["failureCode"];
  failureMessage?: string;
}

/**
 * Transitions a job's status, validated centrally by
 * lib/generation/stateMachine.ts (throws `IllegalStateTransitionError` for
 * an illegal transition — never silently coerced). The `WHERE status =
 * from` clause makes this compare-and-swap: if another process already
 * moved the job on, zero rows update and `StaleJobStateError` is thrown
 * instead of clobbering a concurrent transition.
 */
export async function transitionStatus(
  db: Db,
  jobId: string,
  from: GenerationJobStatus,
  to: GenerationJobStatus,
  patch: TransitionPatch = {},
): Promise<GenerationJobRow> {
  assertTransition(from, to);
  const now = new Date();
  const values: Record<string, unknown> = { status: to, updatedAt: now, ...patch };
  // startedAt is set exactly once, the first time a job leaves `queued`.
  if (from === "queued") values.startedAt = now;
  if (isTerminal(to)) values.completedAt = now;
  if (patch.phase === undefined) values.phase = to;

  const [updated] = await db
    .update(generationJobs)
    .set(values)
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, from)))
    .returning();
  if (!updated) throw new StaleJobStateError(jobId, from);
  return updated;
}

// ─── Cancellation ───────────────────────────────────────────────────────

/**
 * Requests cancellation of an active job. Idempotent and repeatable: a
 * job already `cancelled` returns as-is with no error. A job already
 * `ready`/`failed` cannot be cancelled (`ConflictError`) — a terminal job
 * never re-enters active processing. `queued`/`needs_clarification` jobs
 * (no in-flight worker step to interrupt) are cancelled immediately;
 * actively-processing jobs are flagged via `cancelRequestedAt` and the
 * worker cooperatively observes it at the next safe checkpoint (see
 * lib/generation/pipeline.ts) rather than being killed mid-write.
 */
export async function requestCancellation(db: Db, actor: Actor, appId: string, jobId: string): Promise<GenerationJobRow> {
  await assertCapability(db, actor, appId, "app.cancelGeneration");

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.appId, appId)))
      .for("update")
      .limit(1);
    if (!job) throw new NotFoundError("Generation job", jobId);

    if (job.status === "cancelled") return job;
    if (isTerminal(job.status)) {
      throw new ConflictError(`Generation job already finished with status "${job.status}"; it cannot be cancelled.`);
    }

    const now = new Date();
    if (job.status === "queued" || job.status === "needs_clarification") {
      const [updated] = await tx
        .update(generationJobs)
        .set({
          status: "cancelled",
          phase: "cancelled",
          cancelRequestedAt: now,
          cancelledByPrincipalId: actor.principalId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(generationJobs.id, jobId))
        .returning();
      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "generation.cancelled",
        targetType: "generation_job",
        targetId: jobId,
        metadata: {},
      });
      return updated;
    }

    const [updated] = await tx
      .update(generationJobs)
      .set({ cancelRequestedAt: now, cancelledByPrincipalId: actor.principalId, updatedAt: now })
      .where(eq(generationJobs.id, jobId))
      .returning();
    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generation.cancellation_requested",
      targetType: "generation_job",
      targetId: jobId,
      metadata: {},
    });
    return updated;
  });
}

/** True once a cooperative cancellation request has landed — the pipeline checks this at each phase boundary. */
export function isCancellationRequested(job: GenerationJobRow): boolean {
  return job.cancelRequestedAt !== null || job.status === "cancelled";
}

// ─── Clarification ──────────────────────────────────────────────────────

export interface SubmitClarificationAnswersInput {
  roundNumber: number;
  answers: ClarificationAnswerType[];
}

/**
 * Records an authorized owner/editor's answers to the job's current
 * clarification round and resumes the job (`needs_clarification ->
 * analyzing`), clearing its lease so it is immediately claimable again.
 * Rejects an answer set that doesn't match the round's actual questions
 * (unknown questionId, or the round doesn't exist) rather than accepting
 * it as new free-form intent outside the original questions' scope.
 */
export async function submitClarificationAnswers(
  db: Db,
  actor: Actor,
  appId: string,
  jobId: string,
  input: SubmitClarificationAnswersInput,
): Promise<GenerationJobRow> {
  await assertCapability(db, actor, appId, "app.requestGeneration");

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.appId, appId)))
      .for("update")
      .limit(1);
    if (!job) throw new NotFoundError("Generation job", jobId);
    if (job.status !== "needs_clarification") {
      throw new ConflictError(`Generation job is not awaiting clarification (status: ${job.status})`);
    }

    const parsedState = ClarificationState.safeParse(job.clarificationState ?? { rounds: [] });
    if (!parsedState.success) {
      throw new ConflictError("Generation job's clarification state is corrupted.");
    }
    const round = parsedState.data.rounds.find((r: ClarificationRoundType) => r.roundNumber === input.roundNumber);
    if (!round) {
      throw new ConflictError(`No clarification round ${input.roundNumber} exists on this job.`);
    }
    const validQuestionIds = new Set(round.questions.map((q) => q.id));
    for (const answer of input.answers) {
      if (!validQuestionIds.has(answer.questionId)) {
        throw new ConflictError(`Answer references unknown question id "${answer.questionId}" for this round.`);
      }
    }

    const now = new Date();
    round.answers = input.answers;
    round.answeredAt = now.toISOString();

    const [updated] = await tx
      .update(generationJobs)
      .set({
        status: "analyzing",
        phase: "analyzing:resumed_after_clarification",
        clarificationState: parsedState.data,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(generationJobs.id, jobId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generation.clarification_answered",
      targetType: "generation_job",
      targetId: jobId,
      metadata: { roundNumber: input.roundNumber, questionCount: round.questions.length },
    });

    return updated;
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getGenerationJobForActor(db: Db, actor: Actor, appId: string, jobId: string): Promise<GenerationJobRow> {
  await assertCapability(db, actor, appId, "app.viewGenerationJob");
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.appId, appId)))
    .limit(1);
  if (!job) throw new NotFoundError("Generation job", jobId);
  return job;
}

/** Most recent generation job for an app (any status), for catalog/detail-page status display. Null if none was ever requested. */
export async function getLatestGenerationJobForActor(db: Db, actor: Actor, appId: string): Promise<GenerationJobRow | null> {
  await assertCapability(db, actor, appId, "app.viewGenerationJob");
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.appId, appId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listOperationBatchesForActor(
  db: Db,
  actor: Actor,
  appId: string,
  jobId: string,
): Promise<GenerationOperationBatchRow[]> {
  await assertCapability(db, actor, appId, "app.viewGenerationJob");
  return db
    .select()
    .from(generationOperationBatches)
    .where(and(eq(generationOperationBatches.jobId, jobId), eq(generationOperationBatches.appId, appId)))
    .orderBy(asc(generationOperationBatches.iteration));
}
