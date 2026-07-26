import { and, eq } from "drizzle-orm";
import type { AiProvider, RepairProposalType } from "@asafarim/appbuilder-ai";
import { applySpecOperation, diffSpecifications, type ApplicationSpecificationType, type SpecificationDiff } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { repairAttempts, specifications, specificationVersions, validationGateResults, validationRuns } from "../db/schema";
import type { Actor } from "../auth/actor";
import { applyOperation } from "../repositories/operations";
import { requestPreviewBuild } from "../repositories/previewService";
import { enqueueValidationRun } from "../repositories/validationRuns";
import { recordAuditEvent } from "../repositories/audit";
import { NotFoundError, DestructiveConfirmationRequiredError, OperationValidationError, StaleVersionError } from "../errors";
import {
  heartbeat,
  releaseLease,
  transitionStatus,
  updateAttemptFields,
  isCancellationRequested,
  RepairAttemptLeaseLostError,
  type RepairAttemptRow,
} from "../repositories/repairAttempts";
import { computeRepairProposalChecksum, repairConfirmationExpiresAt } from "./confirmation";
import { classifyRepairError, RepairJobError } from "./errors";
import { classifyValidationFailure } from "./classify";
import { REPAIR_LIMITS } from "../validation/limits";
import { redactDiagnostics } from "../validation/redaction";
import type { RepairAttemptStatus } from "./stateMachine";
import { nudgeValidationWorker } from "../server/queue";

export interface RepairPipelineDeps {
  db: Db;
  provider: AiProvider;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
}

export type RepairPipelineOutcome =
  | { kind: "yielded"; attempt: RepairAttemptRow }
  | { kind: "retry_later"; attempt: RepairAttemptRow; error: RepairJobError }
  | { kind: "lease_lost" };

/** Same trusted-actor pattern as lib/modification/pipeline.ts#actingAsInitiator. */
function actingAsInitiator(attempt: RepairAttemptRow): Actor {
  return { principalId: attempt.initiatedByPrincipalId, roles: [] };
}

async function reloadAttempt(db: Db, attemptId: string): Promise<RepairAttemptRow | null> {
  const [row] = await db.select().from(repairAttempts).where(eq(repairAttempts.id, attemptId)).limit(1);
  return row ?? null;
}

/**
 * Drives one bounded repair attempt through classify -> propose (dry run) ->
 * [awaiting_confirmation] -> apply (M04) -> revalidate (a BRAND NEW
 * validation run, from scratch) -> completed/failed. Mirrors
 * lib/modification/pipeline.ts's phase-dispatch loop and dry-run/confirm/
 * apply shape exactly — the repair loop is an extension of M07's
 * provider/worker infrastructure, never a second orchestration system.
 */
export async function runRepairAttempt(deps: RepairPipelineDeps, initialAttempt: RepairAttemptRow): Promise<RepairPipelineOutcome> {
  let attempt = initialAttempt;

  while (true) {
    if (deps.signal.aborted) {
      attempt = await transitionStatus(deps.db, attempt.id, attempt.status as RepairAttemptStatus, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "This repair was cancelled.",
      });
      return { kind: "yielded", attempt };
    }

    const fresh = await reloadAttempt(deps.db, attempt.id);
    if (!fresh) return { kind: "lease_lost" };
    attempt = fresh;

    if (isCancellationRequested(attempt) && attempt.status !== "cancelled") {
      attempt = await transitionStatus(deps.db, attempt.id, attempt.status as RepairAttemptStatus, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "This repair was cancelled.",
      });
      await recordAuditEvent(deps.db, { appId: attempt.appId, actorPrincipalId: attempt.cancelledByPrincipalId ?? attempt.initiatedByPrincipalId, action: "repair.cancelled", targetType: "repair_attempt", targetId: attempt.id, metadata: {} });
      return { kind: "yielded", attempt };
    }

    try {
      await heartbeat(deps.db, attempt.id, deps.workerId, deps.leaseDurationMs);
    } catch (err) {
      if (err instanceof RepairAttemptLeaseLostError) return { kind: "lease_lost" };
      throw err;
    }

    let next: RepairAttemptRow;
    try {
      next = await runPhase(deps, attempt);
    } catch (err) {
      if (err instanceof RepairAttemptLeaseLostError) return { kind: "lease_lost" };
      const classified = classifyRepairError(err);
      const canRetry = classified.retryable && attempt.status !== "cancelled";
      if (canRetry && classified.code !== "not_repairable" && classified.code !== "repair_budget_exhausted") {
        await releaseLease(deps.db, attempt.id, deps.workerId);
        return { kind: "retry_later", attempt, error: classified };
      }
      const failed = await transitionStatus(deps.db, attempt.id, attempt.status as RepairAttemptStatus, "failed", {
        failureCode: classified.code,
        failureMessage: classified.message,
      });
      await recordAuditEvent(deps.db, { appId: attempt.appId, actorPrincipalId: attempt.initiatedByPrincipalId, action: "repair.failed", targetType: "repair_attempt", targetId: attempt.id, metadata: { failureCode: classified.code } });
      return { kind: "yielded", attempt: failed };
    }

    attempt = next;
    if (attempt.status === "awaiting_confirmation" || attempt.status === "completed" || attempt.status === "failed" || attempt.status === "cancelled") {
      if (attempt.status === "completed") {
        await recordAuditEvent(deps.db, { appId: attempt.appId, actorPrincipalId: attempt.initiatedByPrincipalId, action: "repair.completed", targetType: "repair_attempt", targetId: attempt.id, metadata: { resultingVersionNumber: attempt.resultingVersionNumber, resultingValidationRunId: attempt.resultingValidationRunId } });
      }
      return { kind: "yielded", attempt };
    }
  }
}

async function runPhase(deps: RepairPipelineDeps, attempt: RepairAttemptRow): Promise<RepairAttemptRow> {
  switch (attempt.status as RepairAttemptStatus) {
    case "queued":
      return transitionStatus(deps.db, attempt.id, "queued", "classifying");
    case "classifying":
      return runClassifyingPhase(deps, attempt);
    case "proposing":
      return runProposingPhase(deps, attempt);
    case "applying":
      return runApplyingPhase(deps, attempt);
    case "revalidating":
      return runRevalidatingPhase(deps, attempt);
    default:
      throw new RepairJobError("worker_infrastructure_error", "Repair attempt is in a status the worker does not know how to advance.");
  }
}

// ─── Phase: classifying ───────────────────────────────────────────────────

async function runClassifyingPhase(deps: RepairPipelineDeps, attempt: RepairAttemptRow): Promise<RepairAttemptRow> {
  const gates = await deps.db.select().from(validationGateResults).where(eq(validationGateResults.runId, attempt.originatingRunId));
  const relevantGates = gates.filter((g) => g.status === "failed" || g.status === "infrastructure_error" || g.status === "flaky");
  const classification = classifyValidationFailure(relevantGates);

  if (!classification.repairable) {
    throw new RepairJobError("not_repairable", `This failure was classified as "${classification.classification}", which is never auto-repaired.`, { retryable: false });
  }

  return transitionStatus(deps.db, attempt.id, "classifying", "proposing", {
    phase: "proposing",
    failureClassification: classification.classification,
    targetGateKeys: classification.targetGateKeys,
  });
}

// ─── Phase: proposing (pure dry-run — nothing persisted to the spec yet) ──

interface RejectedEntry {
  index: number;
  operation: unknown;
  reason: string;
}
interface DestructiveEntry {
  index: number;
  operation: unknown;
  classification: string;
  details: string[];
}

async function runProposingPhase(deps: RepairPipelineDeps, attempt: RepairAttemptRow): Promise<RepairAttemptRow> {
  const gates = await deps.db
    .select()
    .from(validationGateResults)
    .where(and(eq(validationGateResults.runId, attempt.originatingRunId)));
  const targetGates = gates.filter((g) => (attempt.targetGateKeys as string[]).includes(g.gateKey));

  const diagnosticsSummary = redactDiagnostics({
    gates: targetGates.map((g) => ({ gateKey: g.gateKey, failureCode: g.failureCode, failureMessage: g.failureMessage, structuredFailures: g.structuredFailures, evidence: g.evidence })),
  });

  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, attempt.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", attempt.appId);
  const beforeSpec = await loadSpecPayload(deps.db, attempt.appId, specRow.currentVersionNumber);

  const { proposal, usage } = await deps.provider.proposeRepair(
    {
      failureClassification: attempt.failureClassification ?? "supported_repairable_configuration_error",
      targetGateKeys: attempt.targetGateKeys as string[],
      diagnosticsSummary,
      currentSpec: beforeSpec,
      operationBudget: REPAIR_LIMITS.MAX_OPERATIONS_PER_ATTEMPT,
    },
    { signal: deps.signal, requestId: `${attempt.id}:propose` },
  );

  if (!proposal.repairable || proposal.batch.operations.length === 0) {
    throw new RepairJobError("not_repairable", proposal.summary.slice(0, 1000), { retryable: false });
  }

  const boundedOps = proposal.batch.operations.slice(0, REPAIR_LIMITS.MAX_OPERATIONS_PER_ATTEMPT);
  let workingSpec: ApplicationSpecificationType = beforeSpec;
  const rejected: RejectedEntry[] = [];
  const destructive: DestructiveEntry[] = [];

  for (let index = 0; index < boundedOps.length; index += 1) {
    const proposed = boundedOps[index];
    const outcome = applySpecOperation(workingSpec, proposed.operation, { confirmDestructive: true });
    if (!outcome.ok) {
      rejected.push({ index, operation: proposed.operation, reason: outcome.errors.map((e) => e.message).join("; ").slice(0, 500) });
      continue;
    }
    workingSpec = outcome.spec;
    if (outcome.destructive) {
      destructive.push({ index, operation: proposed.operation, classification: outcome.destructive.classification, details: outcome.destructive.details });
    }
  }

  const diff: SpecificationDiff = diffSpecifications(beforeSpec, workingSpec);

  await updateAttemptFields(deps.db, attempt.id, {
    proposedOperationCount: boundedOps.length,
    rejectedOperations: rejected as unknown as Record<string, unknown>[],
    destructiveOperations: destructive as unknown as Record<string, unknown>[],
    providerName: deps.provider.name,
    providerModel: usage.model,
    usage: { promptTokens: usage.promptTokens ?? 0, completionTokens: usage.completionTokens ?? 0, totalTokens: usage.totalTokens ?? 0 },
    diagnosticsSummary: {
      ...diagnosticsSummary,
      proposalSummary: proposal.summary,
      diff: diff as unknown as Record<string, unknown>,
      // The exact operations applyOperation must replay in runApplyingPhase —
      // persisted here (not re-requested from the model a second time, which
      // could non-deterministically differ) so applying always replays
      // precisely what was dry-run validated and (if destructive) confirmed.
      proposedOperations: boundedOps as unknown as Record<string, unknown>,
    },
  });

  if (destructive.length > 0) {
    const checksum = computeRepairProposalChecksum(destructive.map((d) => d.operation));
    const expiresAt = repairConfirmationExpiresAt();
    await recordAuditEvent(deps.db, { appId: attempt.appId, actorPrincipalId: attempt.initiatedByPrincipalId, action: "repair.proposed", targetType: "repair_attempt", targetId: attempt.id, metadata: { destructive: true, classification: destructive[0].classification } });
    return transitionStatus(deps.db, attempt.id, "proposing", "awaiting_confirmation", {
      phase: "awaiting_confirmation",
      confirmationRequired: true,
      confirmationChecksum: checksum,
      confirmationBaseVersionNumber: specRow.currentVersionNumber,
      confirmationExpiresAt: expiresAt,
    });
  }

  await recordAuditEvent(deps.db, { appId: attempt.appId, actorPrincipalId: attempt.initiatedByPrincipalId, action: "repair.proposed", targetType: "repair_attempt", targetId: attempt.id, metadata: { destructive: false } });
  return transitionStatus(deps.db, attempt.id, "proposing", "applying", { phase: "applying" });
}

// ─── Phase: applying (the ONLY phase that calls the DB-backed applyOperation, M04) ─

async function runApplyingPhase(deps: RepairPipelineDeps, attempt: RepairAttemptRow): Promise<RepairAttemptRow> {
  const actor = actingAsInitiator(attempt);
  const rejectedIndices = new Set((attempt.rejectedOperations as unknown as RejectedEntry[]).map((r) => r.index));
  const destructiveIndices = new Set((attempt.destructiveOperations as unknown as DestructiveEntry[]).map((d) => d.index));

  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, attempt.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", attempt.appId);

  const proposedOperations = (attempt.diagnosticsSummary as Record<string, unknown>).proposedOperations as unknown as { operation: unknown }[] | undefined;
  if (!proposedOperations) {
    throw new RepairJobError("worker_infrastructure_error", "Repair attempt reached applying without a persisted operation batch.");
  }

  let baseVersionNumber = specRow.currentVersionNumber;
  const appliedIds: string[] = [];

  for (let index = 0; index < proposedOperations.length; index += 1) {
    if (rejectedIndices.has(index)) continue;
    const isConfirmedDestructive = destructiveIndices.has(index);
    const idempotencyKey = `${attempt.id}:op${index}`;
    try {
      const result = await applyOperation(deps.db, actor, attempt.appId, {
        operation: proposedOperations[index].operation,
        baseVersionNumber,
        idempotencyKey,
        confirmDestructive: isConfirmedDestructive,
      });
      appliedIds.push(result.operation.id);
      baseVersionNumber += 1;
    } catch (err) {
      if (err instanceof StaleVersionError) throw err;
      if (err instanceof DestructiveConfirmationRequiredError || err instanceof OperationValidationError) {
        throw new RepairJobError("specification_validation_failed", "The application changed in a way that made this repair unsafe to apply as reviewed.", { cause: err });
      }
      throw err;
    }
  }

  await updateAttemptFields(deps.db, attempt.id, { appliedOperationIds: appliedIds });

  const { build } = await requestPreviewBuild(deps.db, actor, attempt.appId);
  const [updatedSpec] = await deps.db.select().from(specifications).where(eq(specifications.appId, attempt.appId)).limit(1);

  if (build.status !== "succeeded") {
    throw new RepairJobError("preview_failed", "The repair was applied, but building its preview failed.");
  }

  return transitionStatus(deps.db, attempt.id, "applying", "revalidating", {
    phase: "revalidating",
    resultingVersionNumber: updatedSpec?.currentVersionNumber,
    resultingVersionId: build.specificationVersionId,
    resultingPreviewBuildId: build.id,
  });
}

// ─── Phase: revalidating (enqueues + awaits a BRAND NEW validation run) ────

const REVALIDATION_POLL_INTERVAL_MS = 3_000;

async function runRevalidatingPhase(deps: RepairPipelineDeps, attempt: RepairAttemptRow): Promise<RepairAttemptRow> {
  const actor = actingAsInitiator(attempt);
  let revalidationRunId = attempt.resultingValidationRunId;

  if (!revalidationRunId) {
    const run = await enqueueValidationRun(deps.db, actor, attempt.appId, {
      idempotencyKey: `repair:${attempt.id}:revalidate`,
      requestSource: "repair",
      triggeringRepairAttemptId: attempt.id,
    });
    revalidationRunId = run.id;
    await updateAttemptFields(deps.db, attempt.id, { resultingValidationRunId: run.id });
    await nudgeValidationWorker(run.id, { cause: "enqueue" });
  }

  const deadline = (attempt.startedAt?.getTime() ?? Date.now()) + REPAIR_LIMITS.MAX_ATTEMPT_WALL_TIME_MS;

  while (Date.now() < deadline) {
    if (deps.signal.aborted) throw new RepairJobError("cancelled", "This repair was cancelled while awaiting revalidation.", { retryable: false });
    const freshAttempt = await reloadAttempt(deps.db, attempt.id);
    if (freshAttempt && isCancellationRequested(freshAttempt)) {
      throw new RepairJobError("cancelled", "This repair was cancelled while awaiting revalidation.", { retryable: false });
    }
    await heartbeat(deps.db, attempt.id, deps.workerId, deps.leaseDurationMs);

    const [run] = await deps.db.select().from(validationRuns).where(eq(validationRuns.id, revalidationRunId)).limit(1);
    if (!run) throw new RepairJobError("worker_infrastructure_error", "The revalidation run disappeared unexpectedly.");

    if (run.status === "passed") {
      return transitionStatus(deps.db, attempt.id, "revalidating", "completed", { resultingValidationRunId: run.id });
    }
    if (run.status === "failed" || run.status === "infrastructure_error" || run.status === "flaky" || run.status === "cancelled") {
      throw new RepairJobError("revalidation_failed", `The repaired version did not pass revalidation (run status: "${run.status}").`, { retryable: false });
    }

    await new Promise((resolve) => setTimeout(resolve, REVALIDATION_POLL_INTERVAL_MS));
  }

  throw new RepairJobError("repair_budget_exhausted", "Revalidation did not complete within the repair attempt's time budget.", { retryable: false });
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function loadSpecPayload(db: Db, appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", appId);
  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.specificationId, specRow.id), eq(specificationVersions.versionNumber, versionNumber)))
    .limit(1);
  if (!version) throw new NotFoundError("Specification version", `${specRow.id}@${versionNumber}`);
  return version.payload as unknown as ApplicationSpecificationType;
}

export type { RepairProposalType };
