import { and, eq } from "drizzle-orm";
import {
  requiresClarification,
  ClarificationState,
  PLANNING_LIMITS,
  ProviderError,
  type AiProvider,
  type RequirementsAnalysisType,
  type ClarificationStateType,
  type OperationBatchType,
} from "@asafarim/appbuilder-ai";
import { validateSpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { listTemplates, getTemplate } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import {
  creationRequests,
  specifications,
  specificationVersions,
  generationOperationBatches,
  generationJobs,
} from "../db/schema";
import type { Actor } from "../auth/actor";
import { applyOperation } from "../repositories/operations";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { requestPreviewBuild } from "../repositories/previewService";
import { recordAuditEvent } from "../repositories/audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import {
  DestructiveConfirmationRequiredError,
  NotFoundError,
  OperationValidationError,
  StaleVersionError,
} from "../errors";
import {
  heartbeat,
  releaseLease,
  transitionStatus,
  updateJobFields,
  isCancellationRequested,
  LeaseLostError,
  type GenerationJobRow,
} from "../repositories/generationJobs";
import { classifyGenerationError, GenerationJobError } from "./errors";
import { GENERATION_LIMITS } from "./limits";
import type { GenerationJobStatus } from "./stateMachine";

export interface PipelineDeps {
  db: Db;
  provider: AiProvider;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
}

export type PipelineOutcome =
  | { kind: "advanced"; job: GenerationJobRow }
  | { kind: "yielded"; job: GenerationJobRow } // needs_clarification / terminal
  | { kind: "retry_later"; job: GenerationJobRow; error: GenerationJobError }
  | { kind: "lease_lost" };

/**
 * The trusted actor a worker uses for every repository call while
 * processing a job: the platform user who *initiated* generation, captured
 * at enqueue time (`generation_jobs.initiated_by_principal_id`) — never a
 * synthetic "system" principal. `roles: []` deliberately omits any
 * superadmin bypass the initiating user might separately hold, so this
 * actor's effective access is re-derived purely from live
 * ownership/collaborator rows on every `assertCapability` call (see
 * lib/repositories/authz.ts) — if that access was revoked after enqueue,
 * every mutation this actor attempts fails closed with `ForbiddenError`/
 * `NotFoundError` before anything is written, satisfying "if the initiating
 * user loses access before application, fail safely without mutating the
 * specification."
 */
function actingAsInitiator(job: GenerationJobRow): Actor {
  return { principalId: job.initiatedByPrincipalId, roles: [] };
}

/**
 * Runs the generation pipeline forward from the job's current status until
 * it either reaches a terminal status, yields at `needs_clarification`, the
 * caller's AbortSignal fires (cancellation), the lease is lost to another
 * worker, or a retryable provider error requires backing off to a later
 * BullMQ attempt. Never throws for a classified generation failure — those
 * are persisted as `status: "failed"` and returned normally; only
 * unexpected infrastructure errors propagate (classified as
 * `worker_infrastructure_error` first).
 */
export async function runGenerationJob(deps: PipelineDeps, initialJob: GenerationJobRow): Promise<PipelineOutcome> {
  let job = initialJob;

  while (true) {
    if (deps.signal.aborted) {
      job = await transitionStatus(deps.db, job.id, job.status, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "Generation was cancelled.",
      });
      return { kind: "yielded", job };
    }

    const fresh = await reloadJob(deps.db, job.id);
    if (!fresh) return { kind: "lease_lost" };
    job = fresh;

    if (isCancellationRequested(job) && job.status !== "cancelled") {
      job = await transitionStatus(deps.db, job.id, job.status, "cancelled", {
        failureCode: "cancelled",
        failureMessage: "Generation was cancelled.",
      });
      await recordAuditEvent(deps.db, {
        appId: job.appId,
        actorPrincipalId: job.cancelledByPrincipalId ?? job.initiatedByPrincipalId,
        action: "generation.cancelled",
        targetType: "generation_job",
        targetId: job.id,
        metadata: {},
      });
      return { kind: "yielded", job };
    }

    try {
      await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);
    } catch (err) {
      if (err instanceof LeaseLostError) return { kind: "lease_lost" };
      throw err;
    }

    let next: GenerationJobRow;
    try {
      next = await runPhase(deps, job);
    } catch (err) {
      if (err instanceof LeaseLostError) return { kind: "lease_lost" };
      const classified = classifyGenerationError(err);
      const canRetry = classified.retryable && job.attemptCount < GENERATION_LIMITS.MAX_JOB_ATTEMPTS;
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
        action: "generation.failed",
        targetType: "generation_job",
        targetId: job.id,
        metadata: { failureCode: classified.code },
      });
      return { kind: "yielded", job: failed };
    }

    job = next;
    if (job.status === "needs_clarification" || job.status === "ready" || job.status === "failed" || job.status === "cancelled") {
      if (job.status === "ready") {
        await recordAuditEvent(deps.db, {
          appId: job.appId,
          actorPrincipalId: job.initiatedByPrincipalId,
          action: "generation.completed",
          targetType: "generation_job",
          targetId: job.id,
          metadata: { resultingVersionNumber: job.resultingVersionNumber },
        });
      }
      return { kind: "yielded", job };
    }
    // Otherwise loop: keep driving the job through subsequent phases while
    // this worker still holds the lease.
  }
}

async function reloadJob(db: Db, jobId: string): Promise<GenerationJobRow | null> {
  const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  return row ?? null;
}

async function runPhase(deps: PipelineDeps, job: GenerationJobRow): Promise<GenerationJobRow> {
  switch (job.status as GenerationJobStatus) {
    case "queued":
      return transitionStatus(deps.db, job.id, "queued", "analyzing");
    case "analyzing":
      return runAnalyzingPhase(deps, job);
    case "planning":
      return runPlanningIteration(deps, job);
    case "validating":
      return runValidatingPhase(deps, job);
    case "preparing_preview":
      return runPreparingPreviewPhase(deps, job);
    default:
      throw new GenerationJobError(
        "worker_infrastructure_error",
        "Job is in a status the worker does not know how to advance.",
      );
  }
}

// ─── Phase: analyzing ─────────────────────────────────────────────────────

async function runAnalyzingPhase(deps: PipelineDeps, job: GenerationJobRow): Promise<GenerationJobRow> {
  const [creationRequest] = await deps.db
    .select()
    .from(creationRequests)
    .where(eq(creationRequests.id, job.creationRequestId))
    .limit(1);
  if (!creationRequest) throw new NotFoundError("Creation request", job.creationRequestId);

  const clarificationState = parseClarificationState(job.clarificationState);
  const availableTemplateIds = listTemplates().map((t) => t.id);

  const { analysis, usage } = await deps.provider.analyzeRequirements(
    {
      prompt: creationRequest.prompt.slice(0, PLANNING_LIMITS.MAX_PROMPT_LENGTH),
      requestedStarterFamily: creationRequest.starterFamily,
      clarificationHistory: clarificationState.rounds,
      availableTemplateIds,
    },
    { signal: deps.signal, requestId: `${job.id}:analyze:a${job.attemptCount}` },
  );
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  if (requiresClarification(analysis)) {
    const roundNumber = clarificationState.rounds.length + 1;
    if (roundNumber > PLANNING_LIMITS.MAX_CLARIFICATION_ROUNDS) {
      throw new GenerationJobError(
        "invalid_request",
        "Too many clarification rounds were needed to safely interpret this request.",
      );
    }
    const nextState: ClarificationStateType = {
      rounds: [
        ...clarificationState.rounds,
        {
          roundNumber,
          questions: analysis.clarificationQuestions,
          answers: [],
          askedAt: new Date().toISOString(),
        },
      ],
    };
    return transitionStatus(deps.db, job.id, "analyzing", "needs_clarification", {
      phase: `needs_clarification:round-${roundNumber}`,
      normalizedRequirements: analysis,
      clarificationState: nextState,
      providerName: deps.provider.name,
      providerModel: usage.model,
      usage: accumulateUsage(job.usage, usage),
    });
  }

  return transitionStatus(deps.db, job.id, "analyzing", "planning", {
    phase: "planning:template_selection",
    normalizedRequirements: analysis,
    providerName: deps.provider.name,
    providerModel: usage.model,
    usage: accumulateUsage(job.usage, usage),
  });
}

// ─── Phase: planning (template selection, once) + operation proposal/apply (looped) ─────

async function runPlanningIteration(deps: PipelineDeps, job: GenerationJobRow): Promise<GenerationJobRow> {
  const actor = actingAsInitiator(job);
  const analysis = job.normalizedRequirements as unknown as RequirementsAnalysisType;
  if (!analysis) {
    throw new GenerationJobError("worker_infrastructure_error", "Job reached planning without normalized requirements.");
  }

  let currentJob = job;
  let baseVersionNumber = job.baseVersionNumber;
  let selectedTemplateId = job.selectedTemplateId;

  if (!selectedTemplateId) {
    const [creationRequest] = await deps.db
      .select()
      .from(creationRequests)
      .where(eq(creationRequests.id, job.creationRequestId))
      .limit(1);
    if (!creationRequest) throw new NotFoundError("Creation request", job.creationRequestId);

    const catalog = listTemplates().map((t) => ({ id: t.id, displayName: t.displayName, description: t.description }));
    const { recommendation, usage } = await deps.provider.recommendTemplate(
      { analysis, availableTemplates: catalog, requestedStarterFamily: creationRequest.starterFamily },
      { signal: deps.signal, requestId: `${job.id}:template:a${job.attemptCount}` },
    );
    await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

    const template = getTemplate(recommendation.templateId) ?? getTemplate(creationRequest.starterFamily);
    if (!template) {
      // Neither the model's pick nor the user's own originally requested
      // starter family resolved to a registered template — infrastructure
      // inconsistency (the starter_family enum and the template registry
      // are expected to always agree), not a model or user mistake.
      throw new GenerationJobError("worker_infrastructure_error", "No registered template could be resolved for this app.");
    }
    selectedTemplateId = template.id;

    const templateSelection = {
      requestedStarterFamily: creationRequest.starterFamily,
      recommended: recommendation,
      selectedTemplateId: template.id,
      differsFromRequested: template.id !== creationRequest.starterFamily,
    };

    const version = await applyTemplateVersion(deps.db, actor, job.appId, {
      template,
      baseVersionNumber,
      idempotencyKey: `${job.id}:template`,
    });
    baseVersionNumber = version.versionNumber;

    currentJob = await updateJobFields(deps.db, job.id, {
      phase: "planning:proposing_operations",
      selectedTemplateId,
      templateSelection,
      providerName: deps.provider.name,
      providerModel: usage.model,
      usage: accumulateUsage(currentJob.usage, usage),
    });
  }

  const iteration = await countBatches(deps.db, job.id);

  const [spec] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);
  if (!spec) throw new NotFoundError("Specification for app", job.appId);
  const currentSpecPayload = await loadCurrentSpecPayload(deps.db, job.appId, spec.currentVersionNumber);

  const remainingOperationBudget = PLANNING_LIMITS.MAX_TOTAL_OPERATIONS - currentJob.totalOperationsApplied;
  const maxIterations = PLANNING_LIMITS.MAX_PLANNING_ITERATIONS;

  const batchesSoFar = await deps.db
    .select({ reasoningSummary: generationOperationBatches.reasoningSummary })
    .from(generationOperationBatches)
    .where(eq(generationOperationBatches.jobId, job.id));

  currentJob = await transitionStatus(deps.db, job.id, "planning", "applying", {
    phase: `applying:iteration-${iteration}`,
    baseVersionNumber,
  });

  let batch: OperationBatchType;
  let providerModel: string;
  if (remainingOperationBudget <= 0 || iteration > maxIterations) {
    batch = { operations: [], reasoningSummary: "Operation budget exhausted; finalizing with what has been applied so far.", isFinalBatch: true };
    providerModel = currentJob.providerModel ?? "n/a";
  } else {
    const proposed = await deps.provider.proposeOperations(
      {
        analysis,
        templateId: selectedTemplateId,
        currentSpec: currentSpecPayload,
        priorBatchSummaries: batchesSoFar.map((b) => b.reasoningSummary),
        remainingOperationBudget,
        iteration,
        maxIterations,
      },
      { signal: deps.signal, requestId: `${job.id}:propose:a${job.attemptCount}:i${iteration}` },
    );
    await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);
    batch = proposed.batch;
    providerModel = proposed.usage.model;
    currentJob = await updateJobFields(deps.db, job.id, {
      providerName: deps.provider.name,
      providerModel,
      usage: accumulateUsage(currentJob.usage, proposed.usage),
    });
  }

  const boundedOps = batch.operations.slice(0, Math.max(0, remainingOperationBudget));
  const { appliedIds, rejected, appliedCount, staleVersion } = await applyBatchOperations(
    deps.db,
    actor,
    job.appId,
    job,
    iteration,
    boundedOps,
  );

  const batchStatus: "applied" | "rejected" = appliedCount > 0 || boundedOps.length === 0 ? "applied" : "rejected";
  await deps.db.insert(generationOperationBatches).values({
    id: generateId(),
    jobId: job.id,
    appId: job.appId,
    iteration,
    reasoningSummary: batch.reasoningSummary,
    isFinalBatch: batch.isFinalBatch,
    proposedOperationCount: boundedOps.length,
    appliedOperationIds: appliedIds,
    status: batchStatus,
    rejectionReason: rejected.length > 0 ? rejected.map((r) => r.reason).join("; ").slice(0, 2000) : null,
    idempotencyKey: `${job.id}:a${job.attemptCount}:i${iteration}:summary`,
    requestHash: checksumOf({ jobId: job.id, iteration, operationCount: boundedOps.length }),
  });

  if (staleVersion) {
    throw staleVersion;
  }

  const totalOperationsApplied = currentJob.totalOperationsApplied + appliedCount;
  currentJob = await updateJobFields(deps.db, job.id, { totalOperationsApplied, providerModel });

  const shouldFinish =
    batch.isFinalBatch || totalOperationsApplied >= PLANNING_LIMITS.MAX_TOTAL_OPERATIONS || iteration >= maxIterations;

  if (shouldFinish) {
    return transitionStatus(deps.db, job.id, "applying", "validating", { phase: "validating" });
  }
  return transitionStatus(deps.db, job.id, "applying", "planning", { phase: "planning:proposing_operations" });
}

async function countBatches(db: Db, jobId: string): Promise<number> {
  const rows = await db
    .select({ id: generationOperationBatches.id })
    .from(generationOperationBatches)
    .where(eq(generationOperationBatches.jobId, jobId));
  return rows.length + 1;
}

async function loadCurrentSpecPayload(db: Db, appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", appId);
  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(
      and(eq(specificationVersions.specificationId, specRow.id), eq(specificationVersions.versionNumber, versionNumber)),
    )
    .limit(1);
  if (!version) throw new NotFoundError("Specification version", `${specRow.id}@${versionNumber}`);
  return version.payload as unknown as ApplicationSpecificationType;
}

interface ApplyBatchResult {
  appliedIds: string[];
  rejected: Array<{ reason: string }>;
  appliedCount: number;
  staleVersion: StaleVersionError | null;
}

/**
 * Applies each proposed operation individually through M04's
 * `applyOperation`, never with `confirmDestructive: true` — the model has
 * no channel to self-approve a destructive change (see
 * @asafarim/appbuilder-ai's ProposedOperation schema). A destructive or
 * semantically-invalid operation is skipped (recorded as rejected) and the
 * rest of the batch still proceeds; a stale base version aborts the whole
 * batch (someone edited the spec concurrently) and is rethrown by the
 * caller to fail the job with `stale_base_version`.
 */
async function applyBatchOperations(
  db: Db,
  actor: Actor,
  appId: string,
  job: GenerationJobRow,
  iteration: number,
  operations: OperationBatchType["operations"],
): Promise<ApplyBatchResult> {
  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", appId);

  let baseVersionNumber = specRow.currentVersionNumber;
  const appliedIds: string[] = [];
  const rejected: Array<{ reason: string }> = [];

  for (let index = 0; index < operations.length; index += 1) {
    const proposed = operations[index];
    const idempotencyKey = `${job.id}:a${job.attemptCount}:i${iteration}:op${index}`;
    try {
      const result = await applyOperation(db, actor, appId, {
        operation: proposed.operation,
        baseVersionNumber,
        idempotencyKey,
        confirmDestructive: false,
      });
      appliedIds.push(result.operation.id);
      baseVersionNumber += 1;
    } catch (err) {
      if (err instanceof StaleVersionError) {
        return { appliedIds, rejected, appliedCount: appliedIds.length, staleVersion: err };
      }
      if (err instanceof DestructiveConfirmationRequiredError || err instanceof OperationValidationError) {
        rejected.push({ reason: err.message });
        continue;
      }
      throw err;
    }
  }

  return { appliedIds, rejected, appliedCount: appliedIds.length, staleVersion: null };
}

// ─── Phase: validating ────────────────────────────────────────────────────

async function runValidatingPhase(deps: PipelineDeps, job: GenerationJobRow): Promise<GenerationJobRow> {
  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);
  if (!specRow) throw new NotFoundError("Specification for app", job.appId);
  const payload = await loadCurrentSpecPayload(deps.db, job.appId, specRow.currentVersionNumber);

  const validation = validateSpecification(payload);
  if (!validation.ok) {
    throw new GenerationJobError(
      "specification_validation_failed",
      "The generated specification did not pass final validation.",
    );
  }

  return transitionStatus(deps.db, job.id, "validating", "preparing_preview", {
    phase: "preparing_preview",
    resultingVersionNumber: specRow.currentVersionNumber,
  });
}

// ─── Phase: preparing_preview ──────────────────────────────────────────────

async function runPreparingPreviewPhase(deps: PipelineDeps, job: GenerationJobRow): Promise<GenerationJobRow> {
  const actor = actingAsInitiator(job);
  const { build } = await requestPreviewBuild(deps.db, actor, job.appId);

  const [specRow] = await deps.db.select().from(specifications).where(eq(specifications.appId, job.appId)).limit(1);

  if (build.status !== "succeeded") {
    throw new GenerationJobError("preview_failed", "The application was generated, but building its preview failed.");
  }

  return transitionStatus(deps.db, job.id, "preparing_preview", "ready", {
    phase: "ready",
    resultingVersionNumber: specRow?.currentVersionNumber ?? job.resultingVersionNumber ?? undefined,
    resultingPreviewBuildId: build.id,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function parseClarificationState(raw: unknown): ClarificationStateType {
  const parsed = ClarificationState.safeParse(raw ?? { rounds: [] });
  return parsed.success ? parsed.data : { rounds: [] };
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
