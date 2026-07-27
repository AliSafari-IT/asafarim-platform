import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import { REGISTRY_VERSION } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import {
  validationRuns,
  validationGateResults,
  validationArtifacts,
  specifications,
  specificationVersions,
  previewBuilds,
} from "../db/schema";
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
  type ValidationRunStatus,
} from "../validation/stateMachine";
import {
  GATE_SET_VERSION,
  GATE_DEFINITIONS,
} from "../validation/gates/registry";
import {
  computeReleaseEligibility,
  countMandatoryPassed,
} from "../validation/eligibility";
import type { GateResult, GateStatus } from "../validation/types";
import { withQuota } from "../quotas/enforce";
import { countConcurrentValidationJobsForApp } from "../quotas/usage";
import { recordUsageEvent } from "../quotas/recordUsage";
import { withQuotaRejectionLogging } from "../observability/events";

export type ValidationRunRow = typeof validationRuns.$inferSelect;
export type ValidationGateResultRow = typeof validationGateResults.$inferSelect;
export type ValidationArtifactRow = typeof validationArtifacts.$inferSelect;

const TERMINAL_STATUS_LIST = [...TERMINAL_STATUSES] as ValidationRunStatus[];

export class ValidationRunLeaseLostError extends ConflictError {
  constructor(runId: string) {
    super(
      `Lease on validation run ${runId} was lost (reclaimed by another worker or run no longer active)`
    );
    this.name = "ValidationRunLeaseLostError";
  }
}

export class StaleValidationRunStateError extends ConflictError {
  constructor(runId: string, expected: string) {
    super(
      `Validation run ${runId} was not in the expected status "${expected}" (concurrent update)`
    );
    this.name = "StaleValidationRunStateError";
  }
}

// ─── Enqueue ────────────────────────────────────────────────────────────

export interface EnqueueValidationRunInput {
  idempotencyKey: string;
  requestSource: "manual" | "repair" | "api";
  triggeringRepairAttemptId?: string;
}

/**
 * Idempotently creates an immutable validation run pinned to the app's
 * CURRENT specification version/checksum at the moment of creation — issue
 * requirement step 2 ("pin the exact draft or preview version/checksum")
 * and step 3 ("create an immutable validation run"). If a succeeded preview
 * build already exists for that exact version+registry, it is pinned too;
 * otherwise `previewBuildId` stays null and the worker pipeline
 * (lib/validation/pipeline.ts) builds one before running preview-dependent
 * gates — never re-resolving "the current version" itself once this row
 * exists.
 */
export async function enqueueValidationRun(
  db: Db,
  actor: Actor,
  appId: string,
  input: EnqueueValidationRunInput
): Promise<ValidationRunRow> {
  const { app } = await assertCapability(db, actor, appId, "app.validate");
  const requestHash = checksumOf({
    appId,
    requestSource: input.requestSource,
    triggeringRepairAttemptId: input.triggeringRepairAttemptId ?? null,
  });

  return withQuotaRejectionLogging(
    db,
    { category: "validation", appId, actorPrincipalId: actor.principalId },
    () =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(validationRuns)
          .where(
            and(
              eq(validationRuns.appId, appId),
              eq(validationRuns.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictError(
              "Idempotency key reused with a different validation request payload"
            );
          }
          return existing;
        }

        const [spec] = await tx
          .select()
          .from(specifications)
          .where(eq(specifications.appId, appId))
          .limit(1);
        if (!spec) throw new NotFoundError("Specification for app", appId);

        const [version] = await tx
          .select()
          .from(specificationVersions)
          .where(
            and(
              eq(specificationVersions.specificationId, spec.id),
              eq(specificationVersions.versionNumber, spec.currentVersionNumber)
            )
          )
          .limit(1);
        if (!version)
          throw new NotFoundError(
            "Specification version",
            `${spec.id}@${spec.currentVersionNumber}`
          );

        const [existingBuild] = await tx
          .select()
          .from(previewBuilds)
          .where(
            and(
              eq(previewBuilds.specificationVersionId, version.id),
              eq(previewBuilds.registryVersion, REGISTRY_VERSION)
            )
          )
          .limit(1);

        // M12: race-safe replacement for the old plain-count
        // `MAX_ACTIVE_RUNS_PER_APP` check — see generationJobs.ts#enqueueGenerationJob
        // for the identical rationale (a bare SELECT-then-INSERT admits two
        // concurrent requests both observing "0 active" and both inserting).
        return withQuota(
          tx,
          appId,
          "concurrent_validation_jobs_per_app",
          () => countConcurrentValidationJobsForApp(tx, appId),
          async () => {
            const [run] = await tx
              .insert(validationRuns)
              .values({
                id: generateId(),
                appId,
                specificationVersionId: version.id,
                specificationChecksum: version.checksum,
                previewBuildId:
                  existingBuild && existingBuild.status === "succeeded"
                    ? existingBuild.id
                    : null,
                previewChecksum: existingBuild?.checksum ?? null,
                registryVersion: REGISTRY_VERSION,
                gateSetVersion: GATE_SET_VERSION,
                requestSource: input.requestSource,
                requestedByPrincipalId: actor.principalId,
                triggeringRepairAttemptId:
                  input.triggeringRepairAttemptId ?? null,
                status: "pending",
                idempotencyKey: input.idempotencyKey,
                requestHash,
                mandatoryGatesTotal: GATE_DEFINITIONS.filter((g) => g.mandatory)
                  .length,
              })
              .returning();

            await recordUsageEvent(tx, {
              appId,
              ownerPrincipalId: app.ownerPrincipalId,
              kind: "validation_run",
              metadata: {
                validationRunId: run.id,
                requestSource: input.requestSource,
              },
            });

            await recordAuditEvent(tx, {
              appId,
              actorPrincipalId: actor.principalId,
              action: "validation.requested",
              targetType: "validation_run",
              targetId: run.id,
              metadata: {
                requestSource: input.requestSource,
                specificationVersionId: version.id,
              },
            });

            return run;
          }
        );
      })
  );
}

// ─── Claiming (worker-side) ─────────────────────────────────────────────

export async function claimRunById(
  db: Db,
  runId: string,
  workerId: string,
  leaseDurationMs: number
): Promise<ValidationRunRow | null> {
  return claimInternal(
    db,
    workerId,
    leaseDurationMs,
    eq(validationRuns.id, runId)
  );
}

export async function claimNextAvailableRun(
  db: Db,
  workerId: string,
  leaseDurationMs: number
): Promise<ValidationRunRow | null> {
  return claimInternal(db, workerId, leaseDurationMs, undefined);
}

async function claimInternal(
  db: Db,
  workerId: string,
  leaseDurationMs: number,
  extraCondition: SQL | undefined
): Promise<ValidationRunRow | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const baseCondition = and(
      notInArray(validationRuns.status, TERMINAL_STATUS_LIST),
      or(
        isNull(validationRuns.leaseExpiresAt),
        lt(validationRuns.leaseExpiresAt, now)
      )
    );
    const candidates = await tx
      .select()
      .from(validationRuns)
      .where(
        extraCondition ? and(baseCondition, extraCondition) : baseCondition
      )
      .orderBy(asc(validationRuns.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(validationRuns)
      .set({
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(validationRuns.id, candidate.id))
      .returning();
    return claimed;
  });
}

export async function heartbeat(
  db: Db,
  runId: string,
  workerId: string,
  leaseDurationMs: number
): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(validationRuns)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(validationRuns.id, runId),
        eq(validationRuns.leaseOwner, workerId),
        notInArray(validationRuns.status, TERMINAL_STATUS_LIST)
      )
    )
    .returning({ id: validationRuns.id });
  if (!updated) throw new ValidationRunLeaseLostError(runId);
}

export async function releaseLease(
  db: Db,
  runId: string,
  workerId: string
): Promise<void> {
  await db
    .update(validationRuns)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(
      and(eq(validationRuns.id, runId), eq(validationRuns.leaseOwner, workerId))
    );
}

// ─── Status transitions ─────────────────────────────────────────────────

export interface ValidationRunTransitionPatch {
  previewBuildId?: string;
  previewChecksum?: string;
  mandatoryGatesTotal?: number;
  mandatoryGatesPassed?: number;
  releaseEligible?: boolean;
  failureCode?: string;
  failureMessage?: string;
}

export async function transitionStatus(
  db: Db,
  runId: string,
  from: ValidationRunStatus,
  to: ValidationRunStatus,
  patch: ValidationRunTransitionPatch = {}
): Promise<ValidationRunRow> {
  assertTransition(from, to);
  const now = new Date();
  const values: Record<string, unknown> = {
    status: to,
    updatedAt: now,
    ...patch,
  };
  if (from === "pending") values.startedAt = now;
  if (isTerminal(to)) values.completedAt = now;

  const [updated] = await db
    .update(validationRuns)
    .set(values)
    .where(and(eq(validationRuns.id, runId), eq(validationRuns.status, from)))
    .returning();
  if (!updated) throw new StaleValidationRunStateError(runId, from);
  return updated;
}

// ─── Cancellation ───────────────────────────────────────────────────────

export async function requestCancellation(
  db: Db,
  actor: Actor,
  appId: string,
  runId: string
): Promise<ValidationRunRow> {
  await assertCapability(db, actor, appId, "app.cancelValidation");

  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(validationRuns)
      .where(and(eq(validationRuns.id, runId), eq(validationRuns.appId, appId)))
      .for("update")
      .limit(1);
    if (!run) throw new NotFoundError("Validation run", runId);

    if (run.status === "cancelled") return run;
    if (isTerminal(run.status)) {
      throw new ConflictError(
        `Validation run already finished with status "${run.status}"; it cannot be cancelled.`
      );
    }

    const now = new Date();
    if (run.status === "pending") {
      const [updated] = await tx
        .update(validationRuns)
        .set({
          status: "cancelled",
          cancelRequestedAt: now,
          cancelledByPrincipalId: actor.principalId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(validationRuns.id, runId))
        .returning();
      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "validation.cancelled",
        targetType: "validation_run",
        targetId: runId,
        metadata: {},
      });
      return updated;
    }

    const [updated] = await tx
      .update(validationRuns)
      .set({
        cancelRequestedAt: now,
        cancelledByPrincipalId: actor.principalId,
        updatedAt: now,
      })
      .where(eq(validationRuns.id, runId))
      .returning();
    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "validation.cancellation_requested",
      targetType: "validation_run",
      targetId: runId,
      metadata: {},
    });
    return updated;
  });
}

export function isCancellationRequested(run: ValidationRunRow): boolean {
  return run.cancelRequestedAt !== null || run.status === "cancelled";
}

// ─── Gate results ───────────────────────────────────────────────────────

/** Upserts one gate's result for a run — (runId, gateKey) is unique, so a re-executed gate (retry) replaces its own prior row rather than accumulating duplicates. */
export async function upsertGateResult(
  db: Db,
  input: {
    runId: string;
    appId: string;
    gateKey: string;
    gateVersion: string;
    mandatory: boolean;
    result: GateResult;
    startedAt: Date;
    completedAt: Date;
    artifactIds: string[];
  }
): Promise<ValidationGateResultRow> {
  const [row] = await db
    .insert(validationGateResults)
    .values({
      id: generateId(),
      runId: input.runId,
      appId: input.appId,
      gateKey: input.gateKey,
      gateVersion: input.gateVersion,
      mandatory: input.mandatory,
      status: input.result.status,
      skipReason: input.result.skipReason ?? null,
      failureCode: input.result.failureCode ?? null,
      failureMessage: input.result.failureMessage ?? null,
      structuredFailures:
        (input.result.structuredFailures as unknown as
          Record<string, unknown>[] | undefined) ?? [],
      evidence: input.result.evidence ?? {},
      artifactIds: input.artifactIds,
      durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    })
    .onConflictDoUpdate({
      target: [validationGateResults.runId, validationGateResults.gateKey],
      set: {
        status: input.result.status,
        skipReason: input.result.skipReason ?? null,
        failureCode: input.result.failureCode ?? null,
        failureMessage: input.result.failureMessage ?? null,
        structuredFailures:
          (input.result.structuredFailures as unknown as
            Record<string, unknown>[] | undefined) ?? [],
        evidence: input.result.evidence ?? {},
        artifactIds: input.artifactIds,
        durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      },
    })
    .returning();
  return row;
}

export async function listGateResultsForRun(
  db: Db,
  runId: string
): Promise<ValidationGateResultRow[]> {
  return db
    .select()
    .from(validationGateResults)
    .where(eq(validationGateResults.runId, runId))
    .orderBy(asc(validationGateResults.createdAt));
}

/**
 * Finalizes a run's rollup counters and release-eligibility flag from its
 * persisted gate results — the ONLY place `releaseEligible` is ever
 * computed/written (see lib/validation/eligibility.ts). `finalStatus` is
 * decided by the caller (lib/validation/pipeline.ts), since only the
 * pipeline knows whether the run as a whole is `passed`/`failed`/
 * `infrastructure_error`/`flaky`.
 */
export async function finalizeRun(
  db: Db,
  runId: string,
  finalStatus: Extract<
    ValidationRunStatus,
    "passed" | "failed" | "infrastructure_error" | "flaky"
  >
): Promise<ValidationRunRow> {
  const gates = await listGateResultsForRun(db, runId);
  const { total, passed } = countMandatoryPassed(gates);
  const releaseEligible =
    finalStatus === "passed" && computeReleaseEligibility(gates);

  return transitionStatus(db, runId, "running", finalStatus, {
    mandatoryGatesTotal: total,
    mandatoryGatesPassed: passed,
    releaseEligible,
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function getValidationRunForActor(
  db: Db,
  actor: Actor,
  appId: string,
  runId: string
): Promise<ValidationRunRow> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  const [run] = await db
    .select()
    .from(validationRuns)
    .where(and(eq(validationRuns.id, runId), eq(validationRuns.appId, appId)))
    .limit(1);
  if (!run) throw new NotFoundError("Validation run", runId);
  return run;
}

export async function listValidationRunsForActor(
  db: Db,
  actor: Actor,
  appId: string,
  limit = 20
): Promise<ValidationRunRow[]> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  return db
    .select()
    .from(validationRuns)
    .where(eq(validationRuns.appId, appId))
    .orderBy(desc(validationRuns.createdAt))
    .limit(limit);
}

export async function getLatestValidationRunForActor(
  db: Db,
  actor: Actor,
  appId: string
): Promise<ValidationRunRow | null> {
  await assertCapability(db, actor, appId, "app.viewValidation");
  const [row] = await db
    .select()
    .from(validationRuns)
    .where(eq(validationRuns.appId, appId))
    .orderBy(desc(validationRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getGateResultsForActor(
  db: Db,
  actor: Actor,
  appId: string,
  runId: string
): Promise<ValidationGateResultRow[]> {
  await getValidationRunForActor(db, actor, appId, runId); // capability + existence + app-scoping check
  return listGateResultsForRun(db, runId);
}

export async function getArtifactsForActor(
  db: Db,
  actor: Actor,
  appId: string,
  runId: string
): Promise<ValidationArtifactRow[]> {
  await getValidationRunForActor(db, actor, appId, runId);
  return db
    .select()
    .from(validationArtifacts)
    .where(
      and(
        eq(validationArtifacts.runId, runId),
        eq(validationArtifacts.appId, appId)
      )
    );
}

export type GateStatusForEligibility = GateStatus;
