import { and, eq } from "drizzle-orm";
import {
  type AiProvider,
  type ModificationClarificationRoundType,
  type ModificationClarificationStateType,
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
import {
  advanceToNextStep,
  getPlanStepById,
  stopPlanOnStepEnd,
  createModificationPlan,
  type ModificationPlanStepRow,
} from "../repositories/modificationPlans";
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
import { buildModificationContext, toPersistableManifest } from "./contextAssembler";
import { buildSpecIndex } from "./specIndex";
import type { TargetResolution } from "./targetResolver";
import type { SelectionContextType } from "./selectionContext";
import type { PersistedStepRequest } from "./types";
import { recordResolvedReference } from "../repositories/conversationMemory";
import { nudgeModificationWorker } from "../server/queue";

export interface ModificationPipelineDeps {
  db: Db;
  provider: AiProvider;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
}

export type ModificationPipelineOutcome =
  | { kind: "advanced"; job: ModificationJobRow }
  | { kind: "yielded"; job: ModificationJobRow } // awaiting_confirmation / needs_clarification / terminal
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
      await stopPlanIfApplicable(deps, job, "cancelled");
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
      await stopPlanIfApplicable(deps, job, "cancelled");
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
      await stopPlanIfApplicable(deps, failed, "failed");
      return { kind: "yielded", job: failed };
    }

    job = next;
    if (
      job.status === "awaiting_confirmation" ||
      job.status === "needs_clarification" ||
      job.status === "ready" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      if (job.status === "ready") {
        await recordAuditEvent(deps.db, {
          appId: job.appId,
          actorPrincipalId: job.initiatedByPrincipalId,
          action: "modification.completed",
          targetType: "modification_job",
          targetId: job.id,
          metadata: { resultingVersionNumber: job.resultingVersionNumber },
        });
        await advancePlanIfApplicable(deps, job);
      } else if (job.status === "failed" || job.status === "cancelled") {
        await stopPlanIfApplicable(deps, job, job.status);
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
  const selection = (job.selectionContext as unknown as SelectionContextType | null) ?? null;

  // M13 slice D: interpretation is grounded before the provider is ever
  // called. `buildModificationContext` is the single provider-input builder
  // — it indexes the current specification, resolves the request's target
  // deterministically, verifies conversation memory against that index, and
  // assembles bounded history and attachment evidence with a manifest of
  // what was included, truncated, or dropped.
  //
  // M13 slice E: when this call resumes an answered clarification whose
  // choice named a stable target, that target overrides the deterministic
  // resolver (see contextAssembler.ts's forcedTargetId) — the human already
  // told us which one they meant.
  const context = await buildModificationContext({
    db: deps.db,
    appId: job.appId,
    conversationId: job.conversationId,
    triggeringMessageId: job.triggeringMessageId,
    userRequest: job.userRequestText,
    currentSpec,
    currentVersionNumber: job.baseVersionNumber,
    selection,
    forcedTargetId: forcedTargetFromClarification(job),
  });
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  const { decision, usage } = await deps.provider.proposeModification(
    {
      userRequest: job.userRequestText,
      currentSpec,
      selection: selection as ModificationSelectionContext | null,
      operationBudget: MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL,
      groundedContext: context.grounded,
    },
    { signal: deps.signal, requestId: `${job.id}:interpret:a${job.attemptCount}` },
  );
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  // Persisted regardless of outcome — a job that ended in a question is
  // exactly the one an operator most needs to be able to explain, and this
  // is the safe summary (no prompt, no conversation text, no file content).
  const contextManifest = {
    ...toPersistableManifest(context.grounded),
    // The phrases this request bound to its target, kept so a successful
    // apply can write them into memory (see recordResolvedReferences) —
    // "the title" must still mean something two turns later.
    memoryPhrases: memoryPhrasesFor(context.resolution),
  };
  const providerFields = {
    providerName: deps.provider.name,
    providerModel: usage.model,
    usage: accumulateUsage(job.usage, usage),
  };

  // ─── needs_clarification: a PAUSE, never a failure (M13 slice E) ────────
  if (decision.outcome === "needs_clarification") {
    const existingState: ModificationClarificationStateType = (job.clarificationState as unknown as ModificationClarificationStateType | null) ?? {
      rounds: [],
    };
    const nextRoundNumber = existingState.rounds.length + 1;

    if (nextRoundNumber > MODIFICATION_LIMITS.MAX_CLARIFICATION_ROUNDS) {
      // Two rounds already asked and answered, and still ambiguous — per
      // the M13 product contract, a third question is not the safe option;
      // stop and ask the user to restate rather than guess.
      const notice = `This still isn't resolved after ${existingState.rounds.length} clarifying question(s). Please send a new message describing exactly what to change.`;
      await appendSystemMessage(deps.db, {
        conversationId: job.conversationId,
        appId: job.appId,
        messageType: "capability_notice",
        content: notice,
        modificationJobId: job.id,
      });
      await updateJobFields(deps.db, job.id, { contextManifest });
      throw new ModificationJobError("invalid_request", notice);
    }

    const now = new Date();
    const round: ModificationClarificationRoundType = {
      roundNumber: nextRoundNumber,
      question: decision.question,
      contextVersion: job.baseVersionNumber,
      askedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + MODIFICATION_LIMITS.CLARIFICATION_TTL_MS).toISOString(),
    };
    const newState: ModificationClarificationStateType = { rounds: [...existingState.rounds, round] };

    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "clarification_question",
      content: decision.question.text,
      modificationJobId: job.id,
    });

    return transitionStatus(deps.db, job.id, "interpreting", "needs_clarification", {
      phase: "needs_clarification",
      contextManifest,
      clarificationState: newState as unknown as Record<string, unknown>,
      ...providerFields,
    });
  }

  // ─── unsupported: a truthful terminal outcome, never the generic invalid_request ──
  if (decision.outcome === "unsupported") {
    const notice = renderCapabilityNotice(decision.unsupported, decision.alternatives);
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "capability_notice",
      content: notice,
      modificationJobId: job.id,
      diffSummary: { unsupported: decision.unsupported, alternatives: decision.alternatives } as unknown as Record<string, unknown>,
    });
    await updateJobFields(deps.db, job.id, { contextManifest, ...providerFields });
    throw new ModificationJobError("unsupported_request", notice.slice(0, 1000));
  }

  // ─── ready / partially_supported: one or more bounded steps ────────────
  const boundedPlan = decision.plan.slice(0, MODIFICATION_LIMITS.MAX_PLAN_STEPS);
  if (boundedPlan.length === 0) {
    throw new ModificationJobError("worker_infrastructure_error", "The proposal did not include any steps.");
  }

  if (boundedPlan.length === 1 && decision.outcome === "ready") {
    const persisted: PersistedStepRequest = { summary: decision.summary, assumptions: decision.assumptions, batch: boundedPlan[0].batch };
    return transitionStatus(deps.db, job.id, "interpreting", "proposing", {
      phase: "proposing",
      normalizedRequest: persisted as unknown as Record<string, unknown>,
      contextManifest,
      ...providerFields,
    });
  }

  // Multi-step: a `ready` decision spanning more than one step, or any
  // `partially_supported` decision (which always carries a plan alongside
  // its honest gaps). Reuses the exact same single-step pipeline for every
  // step (lib/repositories/modificationPlans.ts) — no second executor.
  const { plan, steps } = await createModificationPlan(deps.db, {
    appId: job.appId,
    conversationId: job.conversationId,
    triggeringMessageId: job.triggeringMessageId,
    baseVersionNumber: job.baseVersionNumber,
    summary: decision.summary,
    capabilityAssessment: {
      assumptions: decision.assumptions,
      unsupported: decision.outcome === "partially_supported" ? decision.unsupported : [],
    },
    steps: boundedPlan.map((step) => ({ title: step.title, batch: step.batch })),
    firstStepJobId: job.id,
  });

  await appendSystemMessage(deps.db, {
    conversationId: job.conversationId,
    appId: job.appId,
    messageType: "plan",
    content: renderPlanSummary(decision.summary, boundedPlan),
    modificationJobId: job.id,
    diffSummary: { planId: plan.id, steps: steps.map((s) => ({ stepNumber: s.stepNumber, title: s.title })) } as unknown as Record<
      string,
      unknown
    >,
  });

  if (decision.outcome === "partially_supported") {
    const notice = renderCapabilityNotice(decision.unsupported, []);
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "capability_notice",
      content: notice,
      modificationJobId: job.id,
      diffSummary: { unsupported: decision.unsupported } as unknown as Record<string, unknown>,
    });
  }

  const firstStep = boundedPlan[0];
  const persisted: PersistedStepRequest = { summary: firstStep.title, assumptions: decision.assumptions, batch: firstStep.batch };
  return transitionStatus(deps.db, job.id, "interpreting", "proposing", {
    phase: "proposing",
    normalizedRequest: persisted as unknown as Record<string, unknown>,
    planStepId: steps[0].id,
    contextManifest,
    ...providerFields,
  });
}

/**
 * M13 slice E — when this job's last clarification round was just
 * answered with a choice naming a stable target, that target is
 * authoritative for this interpretation pass.
 */
function forcedTargetFromClarification(job: ModificationJobRow): string | undefined {
  const state = job.clarificationState as unknown as ModificationClarificationStateType | null;
  if (!state || state.rounds.length === 0) return undefined;
  const last = state.rounds[state.rounds.length - 1];
  if (!last.answer?.choiceId) return undefined;
  return last.question.choices.find((c) => c.id === last.answer!.choiceId)?.targetId;
}

function renderPlanSummary(summary: string, plan: readonly { title: string }[]): string {
  const steps = plan.map((step, index) => `${index + 1}. ${step.title}`).join(" ");
  return `${summary} Staged as ${plan.length} step(s): ${steps}`;
}

function renderCapabilityNotice(
  unsupported: readonly { requested: string; reason: string }[],
  alternatives: readonly { description: string }[],
): string {
  const gaps = unsupported.map((gap) => `${gap.requested} — ${gap.reason}`).join(" ");
  const alts = alternatives.length > 0 ? ` Closest supported alternative(s): ${alternatives.map((a) => a.description).join("; ")}.` : "";
  return `This platform cannot represent: ${gaps}.${alts}`;
}

/**
 * The phrases worth binding to the resolved target once a change actually
 * lands. Value phrases first ("Home"), then property words ("title") — the
 * two ways the reported conversation referred back to the same thing. Bound
 * to two so memory stays a small, checkable set rather than a bag of every
 * noun the user typed.
 */
function memoryPhrasesFor(resolution: TargetResolution): string[] {
  return [...resolution.signals.valuePhrases, ...resolution.signals.propertyPhrases]
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && phrase.length <= 120)
    .slice(0, 2);
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
  const persisted = job.normalizedRequest as unknown as PersistedStepRequest;
  if (!persisted) {
    throw new ModificationJobError("worker_infrastructure_error", "Job reached proposing without a stored proposal.");
  }

  const boundedOps = persisted.batch.operations.slice(0, MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL);
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
      reasoningSummary: persisted.batch.reasoningSummary,
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
      content: persisted.summary,
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
    content: persisted.summary,
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
  const persisted = job.normalizedRequest as unknown as PersistedStepRequest;
  if (!persisted) throw new ModificationJobError("worker_infrastructure_error", "Job reached applying without a stored proposal.");

  const [batchRow] = await deps.db
    .select()
    .from(modificationOperationBatches)
    .where(eq(modificationOperationBatches.jobId, job.id))
    .limit(1);
  if (!batchRow) throw new ModificationJobError("worker_infrastructure_error", "Job reached applying without a persisted proposal batch.");

  const boundedOps = persisted.batch.operations.slice(0, MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL);
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

  await recordResolvedReferences(deps, updated);

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

// ─── Plan advancement / failure recovery (M13 slice E) ─────────────────────

/**
 * Called only when a step's job reaches `ready`. Best-effort: the job's own
 * success is already durable (versioned, previewed, and messaged) before
 * this runs, so a failure here must never look like the change itself
 * failed — it only means the platform could not automatically continue the
 * plan, which is surfaced as its own message rather than thrown.
 */
async function advancePlanIfApplicable(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<void> {
  if (!job.planStepId) return;

  let step: ModificationPlanStepRow | null;
  let result: Awaited<ReturnType<typeof advanceToNextStep>>;
  try {
    step = await getPlanStepById(deps.db, job.planStepId);
    if (!step) return;
    result = await advanceToNextStep(deps.db, job, step);
  } catch (err) {
    await recordAuditEvent(deps.db, {
      appId: job.appId,
      actorPrincipalId: job.initiatedByPrincipalId,
      action: "modification.plan_advance_failed",
      targetType: "modification_job",
      targetId: job.id,
      metadata: { reason: err instanceof Error ? err.name : "unknown" },
    });
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "failure",
      content: "This staged change applied, but the platform could not start the next step automatically. Send the request again to continue.",
      modificationJobId: job.id,
    });
    return;
  }

  if (result.kind === "completed") {
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "system_status",
      content: "This staged change is complete — every step applied.",
      modificationJobId: job.id,
    });
    return;
  }

  await appendSystemMessage(deps.db, {
    conversationId: job.conversationId,
    appId: job.appId,
    messageType: "system_status",
    content: `Step ${step.stepNumber} applied. Starting step ${result.nextStepNumber}: ${result.nextStepTitle}.`,
    modificationJobId: job.id,
  });

  // The step's job row is already durably created and claimable at this
  // point — nudging is a latency optimization only (same contract as every
  // other nudge* call in this codebase; see lib/server/queue.ts's doc
  // comment). A lost/failed nudge (e.g. Redis unavailable) must never be
  // reported as a plan failure: the stale-lease sweep still finds and
  // processes the new job.
  try {
    await nudgeModificationWorker(result.nextJob.id, { cause: "resume" });
  } catch {
    // Best-effort only — see comment above.
  }
}

/**
 * Called when a step's job ends `failed`/`cancelled`. Leaves every
 * already-`applied` step's version exactly as it landed — a recoverable
 * partial result (M13 doc: "stops with a recoverable partial result if a
 * later stage fails"), never a rollback.
 */
async function stopPlanIfApplicable(
  deps: ModificationPipelineDeps,
  job: ModificationJobRow,
  outcome: "failed" | "cancelled",
): Promise<void> {
  if (!job.planStepId) return;
  try {
    const step = await getPlanStepById(deps.db, job.planStepId);
    if (!step) return;
    const steps = await stopPlanOnStepEnd(deps.db, step, outcome, job.failureCode ?? null, job.failureMessage ?? null);
    const appliedCount = steps.filter((s: ModificationPlanStepRow) => s.status === "applied").length;
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "system_status",
      content: `This staged change stopped after step ${step.stepNumber} of ${steps.length} (${appliedCount} step(s) applied and kept).`,
      modificationJobId: job.id,
    });
  } catch {
    // Best-effort bookkeeping only — the job's own terminal state is
    // already durable regardless of whether this plan-side note lands.
  }
}

/**
 * M13 slice D: binds the phrases this request used ("the title", "Home") to
 * the stable target it actually changed, so the next turn can say "it is
 * still black" and be understood.
 *
 * Deliberately written AFTER the version bump, against the resulting
 * specification: recording the pre-change value would make the very edit we
 * just applied look like third-party drift and invalidate the reference on
 * the next recall (memory.ts#invalidateStaleFacts compares recorded value to
 * current value). Recording the post-change value means a later
 * invalidation is a true signal — someone or something else moved it.
 *
 * Memory is an aid to interpretation, never a precondition for correctness:
 * a failure here must not fail a change that has already been applied,
 * versioned, validated, and previewed. So it is best-effort and logged
 * through the job's own audit trail rather than thrown.
 */
async function recordResolvedReferences(deps: ModificationPipelineDeps, job: ModificationJobRow): Promise<void> {
  const manifest = job.contextManifest as Record<string, unknown> | null;
  const targetId = typeof manifest?.resolvedTargetId === "string" ? manifest.resolvedTargetId : null;
  const phrases = Array.isArray(manifest?.memoryPhrases) ? (manifest.memoryPhrases as unknown[]) : [];
  if (!targetId || phrases.length === 0) return;

  const versionNumber = job.resultingVersionNumber;
  if (!versionNumber) return;

  try {
    const spec = await loadCurrentSpecPayload(deps.db, job.appId, versionNumber);
    const index = buildSpecIndex(spec, versionNumber);
    const target = index.byTargetId.get(targetId);
    // The change may have removed the very thing it targeted (an archive, a
    // rename that re-keys an id). Nothing to remember, and nothing broken.
    if (!target) return;

    for (const phrase of phrases) {
      if (typeof phrase !== "string" || phrase.length === 0) continue;
      await recordResolvedReference(deps.db, {
        appId: job.appId,
        conversationId: job.conversationId,
        specificationVersionNumber: versionNumber,
        reference: {
          phrase,
          targetId: target.targetId,
          property: target.property,
          recordedValue: target.value,
          pageId: target.pageId,
          componentId: target.componentId,
          entityId: target.entityId,
          fieldId: target.fieldId,
          sourceMessageIds: [job.triggeringMessageId],
          specificationVersionNumber: versionNumber,
          recordedAt: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    await recordAuditEvent(deps.db, {
      appId: job.appId,
      actorPrincipalId: job.initiatedByPrincipalId,
      action: "modification.memory_write_failed",
      targetType: "modification_job",
      targetId: job.id,
      metadata: { targetId, reason: err instanceof Error ? err.name : "unknown" },
    });
  }
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

