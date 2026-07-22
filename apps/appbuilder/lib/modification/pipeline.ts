import { and, eq } from "drizzle-orm";
import {
  type AiProvider,
  type ModificationProposalType,
  type ModificationSelectionContext,
} from "@asafarim/appbuilder-ai";
import {
  applySpecOperation,
  diffSpecifications,
  validateSpecification,
  type ApplicationSpecificationType,
  type SpecificationDiff,
} from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { specifications, specificationVersions, modificationOperationBatches, modificationJobs } from "../db/schema";
import type { Actor } from "../auth/actor";
import { applyOperation } from "../repositories/operations";
import { requestPreviewBuild } from "../repositories/previewService";
import { recordAuditEvent } from "../repositories/audit";
import { appendSystemMessage } from "../repositories/conversations";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { DestructiveConfirmationRequiredError, NotFoundError, OperationValidationError, StaleVersionError } from "../errors";
import {
  heartbeat,
  releaseLease,
  transitionStatus,
  updateJobFields,
  isCancellationRequested,
  ModificationLeaseLostError,
  type ModificationJobRow,
} from "../repositories/modificationJobs";
import { computeProposalChecksum, confirmationExpiresAt } from "./confirmation";
import { classifyModificationError, ModificationJobError } from "./errors";
import { MODIFICATION_LIMITS } from "./limits";
import type { ModificationJobStatus } from "./stateMachine";

export interface ModificationPipelineDeps {
  db: Db;
  provider: AiProvider;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
}

export type ModificationPipelineOutcome =
  | { kind: "advanced"; job: ModificationJobRow }
  | { kind: "yielded"; job: ModificationJobRow } // awaiting_confirmation / terminal
  | { kind: "retry_later"; job: ModificationJobRow; error: ModificationJobError }
  | { kind: "lease_lost" };

/**
 * Same trusted-actor pattern as lib/generation/pipeline.ts —
 * `initiatedByPrincipalId` is captured once at enqueue from the session,
 * never client-supplied afterward, and replayed with an empty roles list so
 * every M04/M06 call re-derives live access rather than trusting a cached
 * permission.
 */
function actingAsInitiator(job: ModificationJobRow): Actor {
  return { principalId: job.initiatedByPrincipalId, roles: [] };
}

export async function runModificationJob(
  deps: ModificationPipelineDeps,
  initialJob: ModificationJobRow,
): Promise<ModificationPipelineOutcome> {
  let job = initialJob;

  while (true) {
    if (deps.signal.aborted) {
      job = await transitionStatus(deps.db, job.id, job.status, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "This change was cancelled.",
      });
      return { kind: "yielded", job };
    }

    const fresh = await reloadJob(deps.db, job.id);
    if (!fresh) return { kind: "lease_lost" };
    job = fresh;

    if (isCancellationRequested(job) && job.status !== "cancelled") {
      job = await transitionStatus(deps.db, job.id, job.status, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "This change was cancelled.",
      });
      await recordAuditEvent(deps.db, {
        appId: job.appId,
        actorPrincipalId: job.cancelledByPrincipalId ?? job.initiatedByPrincipalId,
        action: "modification.cancelled",
        targetType: "modification_job",
        targetId: job.id,
        metadata: {},
      });
      await appendSystemMessage(deps.db, {
        conversationId: job.conversationId,
        appId: job.appId,
        messageType: "system_status",
        content: "This change was cancelled.",
        modificationJobId: job.id,
      });
      return { kind: "yielded", job };
    }

    try {
      await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);
    } catch (err) {
      if (err instanceof ModificationLeaseLostError) return { kind: "lease_lost" };
      throw err;
    }

    let next: ModificationJobRow;
    try {
      next = await runPhase(deps, job);
    } catch (err) {
      if (err instanceof ModificationLeaseLostError) return { kind: "lease_lost" };
      const classified = classifyModificationError(err);
      const canRetry = classified.retryable && job.attemptCount < MODIFICATION_LIMITS.MAX_JOB_ATTEMPTS;
      if (canRetry) {
        await releaseLease(deps.db, job.id, deps.workerId);
        return { kind: "retry_later", job, error: classified };
      }
      const failed = await transitionStatus(deps.db, job.id, job.status, "failed", {
        failureCode: classified.code,
        failureMessage: classified.message,
      });
      await recordAuditEvent(deps.db, {
        appId: job.appId,
        actorPrincipalId: job.initiatedByPrincipalId,
        action: "modification.failed",
        targetType: "modification_job",
        targetId: job.id,
        metadata: { failureCode: classified.code },
      });
      await appendSystemMessage(deps.db, {
        conversationId: job.conversationId,
        appId: job.appId,
        messageType: classified.code === "specification_validation_failed" ? "validation_result" : "failure",
        content: classified.message,
        modificationJobId: job.id,
        failureCode: classified.code,
        failureMessage: classified.message,
      });
      return { kind: "yielded", job: failed };
    }

    job = next;
    if (job.status === "awaiting_confirmation" || job.status === "ready" || job.status === "failed" || job.status === "cancelled") {
      if (job.status === "ready") {
        await recordAuditEvent(deps.db, {
          appId: job.appId,
          actorPrincipalId: job.initiatedByPrincipalId,
          action: "modification.completed",
          targetType: "modification_job",
          targetId: job.id,
          metadata: { resultingVersionNumber: job.resultingVersionNumber },
        });
      }
      return { kind: "yielded", job };
    }
    // Otherwise loop: keep driving the job through subsequent phases.
  }
}

async function reloadJob(db: Db, jobId: string): Promise<ModificationJobRow | null> {
  const [row] = await db.select().from(modificationJobs).where(eq(modificationJobs.id, jobId)).limit(1);
  return row ?? null;
}

async function runPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  switch (job.status as ModificationJobStatus) {
    case "queued":
      return transitionStatus(deps.db, job.id, "queued", "interpreting");
    case "interpreting":
      return runInterpretingPhase(deps, job);
    case "proposing":
      return runProposingPhase(deps, job);
    case "applying":
      return runApplyingPhase(deps, job);
    case "validating":
      return runValidatingPhase(deps, job);
    case "preparing_preview":
      return runPreparingPreviewPhase(deps, job);
    default:
      throw new ModificationJobError(
        "worker_infrastructure_error",
        "Job is in a status the worker does not know how to advance.",
      );
  }
}

// ─── Phase: interpreting ──────────────────────────────────────────────────

async function runInterpretingPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  const currentSpec = await loadCurrentSpecPayload(deps.db, job.appId, job.baseVersionNumber);
  const selection = (job.selectionContext as unknown as ModificationSelectionContext | null) ?? null;

  const { proposal, usage } = await deps.provider.proposeModification(
    {
      userRequest: job.userRequestText,
      currentSpec,
      selection,
      operationBudget: MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL,
    },
    { signal: deps.signal, requestId: `${job.id}:interpret:a${job.attemptCount}` },
  );
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  if (proposal.clarificationNeeded) {
    // M08 deliberately does not implement a multi-round clarification state
    // machine for conversational modification (see schemas/
    // modificationProposal.ts's docstring) — an ambiguous request fails
    // safely with the model's own (schema-bounded, validated) explanation,
    // and the user can simply send a more specific follow-up message.
    throw new ModificationJobError("invalid_request", proposal.summary.slice(0, 1000));
  }

  return transitionStatus(deps.db, job.id, "interpreting", "proposing", {
    phase: "proposing",
    normalizedRequest: proposal as unknown as Record<string, unknown>,
    providerName: deps.provider.name,
    providerModel: usage.model,
    usage: accumulateUsage(job.usage, usage),
  });
}

// ─── Phase: proposing (pure dry-run — nothing is persisted to the spec yet) ─

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

async function runProposingPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  const proposal = job.normalizedRequest as unknown as ModificationProposalType;
  if (!proposal) {
    throw new ModificationJobError("worker_infrastructure_error", "Job reached proposing without a stored proposal.");
  }

  const boundedOps = proposal.batch.operations.slice(0, MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL);
  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", job.appId);

  const beforeSpec = await loadCurrentSpecPayload(deps.db, job.appId, specRow.currentVersionNumber);
  let workingSpec: ApplicationSpecificationType = beforeSpec;
  const rejected: RejectedEntry[] = [];
  const destructive: DestructiveEntry[] = [];

  for (let index = 0; index < boundedOps.length; index += 1) {
    const proposed = boundedOps[index];
    // Dry run only — confirmDestructive:true here just lets the pure engine
    // compute the resulting spec/diff for a destructive op WITHOUT
    // persisting anything; the human confirmation gate is enforced for real
    // in runApplyingPhase, which re-runs each operation through the
    // DB-backed, capability-checked applyOperation.
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

  const [existingBatch] = await deps.db
    .select()
    .from(modificationOperationBatches)
    .where(eq(modificationOperationBatches.jobId, job.id))
    .limit(1);
  if (!existingBatch) {
    await deps.db.insert(modificationOperationBatches).values({
      id: generateId(),
      jobId: job.id,
      appId: job.appId,
      reasoningSummary: proposal.batch.reasoningSummary,
      proposedOperationCount: boundedOps.length,
      appliedOperationIds: [],
      rejectedOperations: rejected as unknown as Record<string, unknown>[],
      destructiveOperations: destructive as unknown as Record<string, unknown>[],
      status: destructive.length > 0 ? "awaiting_confirmation" : "proposed",
      idempotencyKey: `${job.id}:batch`,
      requestHash: checksumOf({ jobId: job.id, operationCount: boundedOps.length }),
    });
  }

  const impactClassification = destructive.length > 0 ? destructive[0].classification : null;

  if (destructive.length > 0) {
    const checksum = computeProposalChecksum(destructive.map((d) => d.operation));
    const expiresAt = confirmationExpiresAt();
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "ai_proposal",
      content: proposal.summary,
      modificationJobId: job.id,
      diffSummary: diff as unknown as Record<string, unknown>,
      impactClassification,
      confirmationState: "pending",
      baseVersionNumber: specRow.currentVersionNumber,
    } as never);
    return transitionStatus(deps.db, job.id, "proposing", "awaiting_confirmation", {
      phase: "awaiting_confirmation",
      confirmationRequired: true,
      confirmationChecksum: checksum,
      confirmationBaseVersionNumber: specRow.currentVersionNumber,
      confirmationExpiresAt: expiresAt,
    });
  }

  await appendSystemMessage(deps.db, {
    conversationId: job.conversationId,
    appId: job.appId,
    messageType: "ai_proposal",
    content: proposal.summary,
    modificationJobId: job.id,
    diffSummary: diff as unknown as Record<string, unknown>,
    impactClassification,
    confirmationState: "not_required",
  } as never);
  return transitionStatus(deps.db, job.id, "proposing", "applying", { phase: "applying" });
}

// ─── Phase: applying (the ONLY phase that ever calls the DB-backed, capability-checked applyOperation) ─

async function runApplyingPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  const actor = actingAsInitiator(job);
  const proposal = job.normalizedRequest as unknown as ModificationProposalType;
  if (!proposal) throw new ModificationJobError("worker_infrastructure_error", "Job reached applying without a stored proposal.");

  const [batchRow] = await deps.db
    .select()
    .from(modificationOperationBatches)
    .where(eq(modificationOperationBatches.jobId, job.id))
    .limit(1);
  if (!batchRow) throw new ModificationJobError("worker_infrastructure_error", "Job reached applying without a persisted proposal batch.");

  const boundedOps = proposal.batch.operations.slice(0, MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL);
  const rejectedIndices = new Set((batchRow.rejectedOperations as unknown as RejectedEntry[]).map((r) => r.index));
  const destructiveIndices = new Set((batchRow.destructiveOperations as unknown as DestructiveEntry[]).map((d) => d.index));

  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", job.appId);

  let baseVersionNumber = specRow.currentVersionNumber;
  const appliedIds: string[] = [];

  for (let index = 0; index < boundedOps.length; index += 1) {
    if (rejectedIndices.has(index)) continue;
    const isConfirmedDestructive = destructiveIndices.has(index);
    const proposedOp = boundedOps[index];
    const idempotencyKey = `${job.id}:op${index}`;
    try {
      const result = await applyOperation(deps.db, actor, job.appId, {
        operation: proposedOp.operation,
        baseVersionNumber,
        idempotencyKey,
        confirmDestructive: isConfirmedDestructive,
      });
      appliedIds.push(result.operation.id);
      baseVersionNumber += 1;
    } catch (err) {
      if (err instanceof StaleVersionError) throw err;
      if (err instanceof DestructiveConfirmationRequiredError || err instanceof OperationValidationError) {
        // The dry run in runProposingPhase said this operation was safe to
        // apply without confirmation, but re-validating against the ACTUAL
        // current specification now disagrees (e.g. the spec changed in a
        // way the diff the user reviewed didn't account for). Rather than
        // silently dropping part of a proposal the user already reviewed
        // and (if needed) confirmed, fail the whole job safely.
        throw new ModificationJobError(
          "specification_validation_failed",
          "The application changed in a way that made this proposal unsafe to apply as reviewed. Please try again.",
          { cause: err },
        );
      }
      throw err;
    }
  }

  await deps.db
    .update(modificationOperationBatches)
    .set({ appliedOperationIds: appliedIds, status: "applied" })
    .where(eq(modificationOperationBatches.id, batchRow.id));

  await updateJobFields(deps.db, job.id, { totalOperationsApplied: appliedIds.length });

  return transitionStatus(deps.db, job.id, "applying", "validating", { phase: "validating" });
}

// ─── Phase: validating ────────────────────────────────────────────────────

async function runValidatingPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", job.appId);
  const payload = await loadCurrentSpecPayload(deps.db, job.appId, specRow.currentVersionNumber);

  const validation = validateSpecification(payload);
  if (!validation.ok) {
    throw new ModificationJobError("specification_validation_failed", "The proposed change did not pass final validation.");
  }

  return transitionStatus(deps.db, job.id, "validating", "preparing_preview", {
    phase: "preparing_preview",
    resultingVersionNumber: specRow.currentVersionNumber,
  });
}

// ─── Phase: preparing_preview ──────────────────────────────────────────────

async function runPreparingPreviewPhase(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<ModificationJobRow> {
  const actor = actingAsInitiator(job);
  const { build } = await requestPreviewBuild(deps.db, actor, job.appId);

  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);

  if (build.status !== "succeeded") {
    throw new ModificationJobError("preview_failed", "The change was applied, but building its preview failed.");
  }

  const updated = await transitionStatus(deps.db, job.id, "preparing_preview", "ready", {
    phase: "ready",
    resultingVersionNumber: specRow?.currentVersionNumber ?? job.resultingVersionNumber ?? undefined,
    resultingPreviewBuildId: build.id,
  });

  // Success is stamped ONLY here, after M04's version bump and M06's
  // preview build have both actually succeeded — never a claim the model
  // itself made (see docs/appbuilder-m08-builder-workspace.md#modification-job-lifecycle).
  await appendSystemMessage(deps.db, {
    conversationId: job.conversationId,
    appId: job.appId,
    messageType: "applied_change",
    content: `Applied. The app is now at version ${updated.resultingVersionNumber} with an updated preview.`,
    modificationJobId: job.id,
    resultingVersionNumber: updated.resultingVersionNumber ?? undefined,
    resultingPreviewBuildId: build.id,
    confirmationState: job.confirmationRequired ? "confirmed" : "not_required",
  });

  return updated;
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function loadCurrentSpecPayload(db: Db, appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  if (versionNumber === 0) {
    throw new ModificationJobError("invalid_request", "This app has no specification yet to modify.");
  }
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

function accumulateUsage(existing: unknown, usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): Record<string, unknown> {
  const prev = (existing as Record<string, number>) ?? {};
  return {
    promptTokens: (prev.promptTokens ?? 0) + (usage.promptTokens ?? 0),
    completionTokens: (prev.completionTokens ?? 0) + (usage.completionTokens ?? 0),
    totalTokens: (prev.totalTokens ?? 0) + (usage.totalTokens ?? 0),
    calls: (prev.calls ?? 0) + 1,
  };
}
