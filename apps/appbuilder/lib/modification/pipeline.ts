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
import { recordOperationalEvent } from "../observability/events";
import { correlationIdForJob } from "../observability/correlation";
import { isContextualMemoryEnabled, isPlanningEnabled, isShadowEvaluationEnabled, isVisionEnabled } from "../features/flags";
import { runShadowEvaluation } from "./shadow";

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
  //
  // M13 slice G: `visionAvailable` and `memoryEnabled` are read from the
  // independent feature flags here rather than assumed. Both are DISCLOSURE
  // inputs, not filters — with vision off, images stay attached and the
  // assembler records `vision_unavailable` so the model is told it cannot
  // see them (and says so) instead of quietly reasoning without them.
  const correlationId = correlationIdForJob(job);
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
    visionAvailable: isVisionEnabled(),
    memoryEnabled: isContextualMemoryEnabled(),
  });
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  await recordContextEvents(deps, job, correlationId, context);

  const providerStartedAt = Date.now();
  let decision: Awaited<ReturnType<AiProvider["proposeModification"]>>["decision"];
  let usage: Awaited<ReturnType<AiProvider["proposeModification"]>>["usage"];
  try {
    ({ decision, usage } = await deps.provider.proposeModification(
      {
        userRequest: job.userRequestText,
        currentSpec,
        selection: selection as ModificationSelectionContext | null,
        operationBudget: MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL,
        groundedContext: context.grounded,
      },
      { signal: deps.signal, requestId: `${job.id}:interpret:a${job.attemptCount}` },
    ));
  } catch (err) {
    // Recorded before re-throwing so a provider outage is visible as a
    // provider outage in the event stream, not only as whatever terminal
    // failure code the retry policy eventually settles on.
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "model.call_failed",
      severity: "error",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        provider: deps.provider.name,
        attempt: job.attemptCount,
        latencyMs: Date.now() - providerStartedAt,
        reason: err instanceof Error ? err.name : "unknown",
      },
    });
    throw err;
  }
  await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);

  // M13 slice G dark launch. Runs AFTER the real decision so it can never
  // delay or influence it, and cannot mutate anything by construction (see
  // lib/modification/shadow.ts). Off unless explicitly enabled — it costs a
  // second provider call per request.
  if (isShadowEvaluationEnabled()) {
    await runShadowEvaluation(
      {
        db: deps.db,
        provider: deps.provider,
        job,
        currentSpec,
        selection,
        signal: deps.signal,
      },
      true,
    );
    await heartbeat(deps.db, job.id, deps.workerId, deps.leaseDurationMs);
  }

  await recordOperationalEvent(deps.db, {
    appId: job.appId,
    correlationId,
    category: "modification",
    kind: "model.call_completed",
    actorPrincipalId: job.initiatedByPrincipalId,
    // Token counts and the decision's SHAPE — never the request text, the
    // summary, the question, or any operation payload.
    detail: {
      jobId: job.id,
      provider: deps.provider.name,
      model: usage.model,
      outcome: decision.outcome,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      latencyMs: Date.now() - providerStartedAt,
      planSteps: decision.outcome === "ready" || decision.outcome === "partially_supported" ? decision.plan.length : 0,
    },
  });

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
      await recordOperationalEvent(deps.db, {
        appId: job.appId,
        correlationId,
        category: "modification",
        kind: "clarification.exhausted",
        severity: "warning",
        actorPrincipalId: job.initiatedByPrincipalId,
        detail: { jobId: job.id, rounds: existingState.rounds.length },
      });
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

    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "clarification.asked",
      actorPrincipalId: job.initiatedByPrincipalId,
      // The question TEXT is deliberately absent: it is model output derived
      // from the user's request and their app's contents, and the count of
      // grounded choices is what tells an operator whether the question was
      // a real disambiguation or a shrug.
      detail: {
        jobId: job.id,
        roundNumber: nextRoundNumber,
        choices: decision.question.choices.length,
        resolutionOutcome: context.grounded.resolutionOutcome,
      },
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

  // ─── Planning disabled: execute the first step, disclose the rest ───────
  //
  // M13 slice G. With planning off, a multi-step decision must not silently
  // become a single-step one — that would apply part of what the user asked
  // for and report complete success. It also must not become a failure: the
  // first step is genuinely valid, independently validated work. So the
  // first step runs and the remaining scope is reported as an unmet gap,
  // which is exactly the "truthful gaps and alternatives" contract M13
  // already requires for capability limits.
  if (!isPlanningEnabled()) {
    const remaining = boundedPlan.slice(1);
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "plan.suppressed_by_flag",
      severity: "warning",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: { jobId: job.id, requestedSteps: boundedPlan.length, executedSteps: 1 },
    });
    await appendSystemMessage(deps.db, {
      conversationId: job.conversationId,
      appId: job.appId,
      messageType: "capability_notice",
      content:
        `This request needs ${boundedPlan.length} steps, and multi-step plans are turned off for this deployment. ` +
        `I am applying only the first step (${boundedPlan[0].title}). Send the remaining work as separate requests: ` +
        `${remaining.map((step) => step.title).join("; ")}.`,
      modificationJobId: job.id,
    });
    const persisted: PersistedStepRequest = {
      summary: boundedPlan[0].title,
      assumptions: decision.assumptions,
      batch: boundedPlan[0].batch,
    };
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

  await recordOperationalEvent(deps.db, {
    appId: job.appId,
    correlationId,
    category: "modification",
    kind: "plan.created",
    actorPrincipalId: job.initiatedByPrincipalId,
    detail: {
      jobId: job.id,
      planId: plan.id,
      steps: steps.length,
      outcome: decision.outcome,
      capabilityGaps: decision.outcome === "partially_supported" ? decision.unsupported.length : 0,
    },
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
 * M13 slice G — the "what was this decision grounded in, and how sure was
 * the resolver" half of the telemetry, emitted once per interpretation pass.
 *
 * Everything in these payloads is a count, an enum, a stable target id, or a
 * confidence number. No conversation text, no attachment content, no
 * reference bodies, no prompt. That is the same rule the persisted
 * `contextManifest` follows, and for the same reason: an audit trail that
 * reconstructs the user's private files is worse than the problem it solves.
 */
async function recordContextEvents(
  deps: ModificationPipelineDeps,
  job: ModificationJobRow,
  correlationId: string,
  context: Awaited<ReturnType<typeof buildModificationContext>>,
): Promise<void> {
  const grounded = context.grounded;
  const manifest = grounded.manifest;

  await recordOperationalEvent(deps.db, {
    appId: job.appId,
    correlationId,
    category: "modification",
    kind: "context.assembled",
    actorPrincipalId: job.initiatedByPrincipalId,
    detail: {
      jobId: job.id,
      specificationVersionNumber: manifest.specificationVersionNumber,
      estimatedTokens: manifest.estimatedTokens,
      includedSources: manifest.includedSourceIds.length,
      omitted: manifest.omitted.length,
      truncated: manifest.truncated.length,
      historyTurns: grounded.history.length,
      memoryFacts: grounded.memory.length,
      attachments: grounded.attachments.length,
      references: grounded.references.length,
      redactionFlags: manifest.redactionFlags,
    },
  });

  // A separate event rather than a flag on the one above: "we dropped part
  // of the evidence to fit a budget" is a tuning signal an operator should
  // be able to alert on, and burying it inside a payload that fires on every
  // single request makes that impractical.
  if (manifest.truncated.length > 0 || manifest.omitted.length > 0) {
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "context.truncated",
      severity: "info",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        truncatedSources: manifest.truncated.length,
        omittedSources: manifest.omitted.length,
        droppedChars: manifest.truncated.reduce((sum, t) => sum + (t.originalChars - t.includedChars), 0),
        omissionReasons: [...new Set(manifest.omitted.map((o) => o.reason))],
      },
    });
  }

  if (manifest.redactionFlags.includes("vision_unavailable")) {
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "context.vision_unavailable",
      severity: "info",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        images: grounded.attachments.filter((a) => a.category === "image").length,
      },
    });
  }

  await recordOperationalEvent(deps.db, {
    appId: job.appId,
    correlationId,
    category: "modification",
    kind:
      grounded.resolutionOutcome === "resolved"
        ? "resolver.resolved"
        : grounded.resolutionOutcome === "ambiguous"
          ? "resolver.ambiguous"
          : "resolver.unresolved",
    severity: "info",
    actorPrincipalId: job.initiatedByPrincipalId,
    detail: {
      jobId: job.id,
      candidates: grounded.targetCandidates.length,
      // A target id is a spec address (`pages.home.name`), not user content
      // — the same identifier already persisted on the job's manifest.
      resolvedTargetId: grounded.resolvedTarget?.targetId ?? null,
      strategy: grounded.resolvedTarget?.strategy ?? null,
      confidence: grounded.resolvedTarget?.confidence ?? null,
      previewEvidenceKind: grounded.previewEvidence?.kind ?? null,
    },
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

  await recordOperationalEvent(deps.db, {
    appId: job.appId,
    correlationId: correlationIdForJob(job),
    category: "modification",
    kind: "plan.step_applied",
    actorPrincipalId: job.initiatedByPrincipalId,
    detail: {
      jobId: job.id,
      planId: step.planId,
      stepNumber: step.stepNumber,
      resultingVersionNumber: job.resultingVersionNumber,
    },
  });

  if (result.kind === "completed") {
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId: correlationIdForJob(job),
      category: "modification",
      kind: "plan.completed",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: { jobId: job.id, planId: step.planId, steps: step.stepNumber },
    });
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
    await recordOperationalEvent(deps.db, {
      appId: job.appId,
      correlationId: correlationIdForJob(job),
      category: "modification",
      kind: "plan.stopped",
      severity: outcome === "failed" ? "warning" : "info",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        planId: step.planId,
        stoppedAtStep: step.stepNumber,
        totalSteps: steps.length,
        appliedSteps: appliedCount,
        outcome,
        failureCode: job.failureCode ?? null,
      },
    });
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
  // M13 slice G: with contextual memory off, nothing new is written either —
  // recall and write are the same switch. Writing rows that recall will never
  // read would accumulate a store whose accuracy nothing verifies, and which
  // would come back as stale facts the moment the flag was flipped on again.
  if (!isContextualMemoryEnabled()) return;

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

