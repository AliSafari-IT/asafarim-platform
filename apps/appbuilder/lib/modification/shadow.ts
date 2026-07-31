import type { AiProvider } from "@asafarim/appbuilder-ai";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { recordOperationalEvent } from "../observability/events";
import { correlationIdForJob } from "../observability/correlation";
import { isContextualMemoryEnabled, isVisionEnabled } from "../features/flags";
import { buildModificationContext } from "./contextAssembler";
import { MODIFICATION_LIMITS } from "./limits";
import type { SelectionContextType } from "./selectionContext";
import type { ModificationJobRow } from "../repositories/modificationJobs";

/**
 * M13 slice G — dark launch: "Dark-launch context/decision generation
 * without applying shadow proposals."
 *
 * This runs the full grounded pipeline — spec index, deterministic target
 * resolution, memory recall, context assembly, and a real provider call —
 * and then throws the result away. Nothing it produces can reach a
 * specification, a message, a plan, or a job's state.
 *
 * That last sentence is the entire contract, so it is enforced structurally
 * rather than by discipline:
 *
 * - **This module never imports the write path.** No `applyOperation`, no
 *   `appendSystemMessage`, no `transitionStatus`, no `createModificationPlan`.
 *   A shadow run cannot mutate a specification because the code that mutates
 *   specifications is not reachable from here. A reviewer can verify that
 *   from the import list alone, which is a much stronger check than reading
 *   the body for accidental writes.
 *
 * - **The only write it makes is one operational event**, and that event
 *   carries scores and shapes — outcome, counts, confidence, token usage —
 *   never the summary, the question, the assumptions, or any operation
 *   payload. M13's telemetry rule is explicit: "Routine telemetry stores
 *   redacted scores/case IDs, not prompts or attachment content."
 *
 * - **It never throws into its caller.** A shadow evaluation failing must
 *   not fail the real request it is shadowing; that would make an
 *   observation-only feature into a new outage source. Every failure is
 *   swallowed and recorded as `shadow.failed`.
 *
 * What it is *for*: answering "would the fully-enabled assistant have done
 * the right thing here" against real traffic, before it is what users get —
 * the middle step between the offline regression corpus (deterministic but
 * synthetic) and general availability.
 *
 * That is why the shadow context is assembled with the M13 capabilities
 * FORCED ON rather than at the deployment's current flag settings. A shadow
 * run that mirrored the live flags would re-run the same computation with
 * the same inputs and learn nothing while paying for a second provider call.
 * The gap between the two configurations is the entire signal, so the event
 * records which flags the shadow overrode.
 */

export interface ShadowEvaluationInput {
  db: Db;
  provider: AiProvider;
  job: ModificationJobRow;
  currentSpec: ApplicationSpecificationType;
  selection: SelectionContextType | null;
  signal: AbortSignal;
}

export interface ShadowEvaluationOutcome {
  evaluated: boolean;
  /** Why it did not run, when it did not. */
  skippedReason?: "disabled" | "failed";
}

/**
 * Runs one shadow evaluation. Safe to call unconditionally: it returns
 * immediately when `APPBUILDER_SHADOW_EVALUATION_ENABLED` is not `"true"`.
 *
 * Callers should treat the return value as informational only and must not
 * branch application behavior on it — doing so would let a shadow run
 * influence a real one, which is exactly what "shadow" excludes.
 */
export async function runShadowEvaluation(
  input: ShadowEvaluationInput,
  enabled: boolean
): Promise<ShadowEvaluationOutcome> {
  if (!enabled) return { evaluated: false, skippedReason: "disabled" };

  const { db, job } = input;
  const correlationId = correlationIdForJob(job);
  const startedAt = Date.now();

  try {
    const context = await buildModificationContext({
      db,
      appId: job.appId,
      conversationId: job.conversationId,
      triggeringMessageId: job.triggeringMessageId,
      userRequest: job.userRequestText,
      currentSpec: input.currentSpec,
      currentVersionNumber: job.baseVersionNumber,
      selection: input.selection,
      // Forced on — see this module's docstring.
      visionAvailable: true,
      memoryEnabled: true,
    });
    const overrodeFlags = [
      ...(isVisionEnabled() ? [] : ["vision"]),
      ...(isContextualMemoryEnabled() ? [] : ["contextualMemory"]),
    ];

    const { decision, usage } = await input.provider.proposeModification(
      {
        userRequest: job.userRequestText,
        currentSpec: input.currentSpec,
        selection: input.selection as never,
        operationBudget: MODIFICATION_LIMITS.MAX_OPERATIONS_PER_PROPOSAL,
        groundedContext: context.grounded,
      },
      // A distinct requestId so a shadow call is never mistaken for the real
      // one in provider-side logs or in any future idempotency handling.
      { signal: input.signal, requestId: `${job.id}:shadow:a${job.attemptCount}` }
    );

    const reachedProposal =
      decision.outcome === "ready" || decision.outcome === "partially_supported";
    const operations = reachedProposal
      ? decision.plan.reduce((sum, step) => sum + step.batch.operations.length, 0)
      : 0;

    await recordOperationalEvent(db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "shadow.evaluated",
      severity: "info",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        // The shape of what WOULD have happened. Nothing here can be
        // replayed into an apply: there are no operation payloads, only
        // their count.
        outcome: decision.outcome,
        planSteps: reachedProposal ? decision.plan.length : 0,
        proposedOperations: operations,
        resolutionOutcome: context.grounded.resolutionOutcome,
        resolvedTargetId: context.grounded.resolvedTarget?.targetId ?? null,
        resolvedConfidence: context.grounded.resolvedTarget?.confidence ?? null,
        candidates: context.grounded.targetCandidates.length,
        estimatedTokens: context.grounded.manifest.estimatedTokens,
        redactionFlags: context.grounded.manifest.redactionFlags,
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        model: usage.model,
        latencyMs: Date.now() - startedAt,
        overrodeFlags,
        applied: false,
      },
    });

    return { evaluated: true };
  } catch (err) {
    // Deliberately swallowed — see this module's docstring.
    await recordOperationalEvent(db, {
      appId: job.appId,
      correlationId,
      category: "modification",
      kind: "shadow.failed",
      severity: "warning",
      actorPrincipalId: job.initiatedByPrincipalId,
      detail: {
        jobId: job.id,
        reason: err instanceof Error ? err.name : "unknown",
        latencyMs: Date.now() - startedAt,
      },
    }).catch(() => undefined);
    return { evaluated: false, skippedReason: "failed" };
  }
}
