import { z } from "zod";
import { OperationBatch, type OperationBatchType } from "./operationProposal";
import { ModificationClarificationQuestion } from "./modificationClarification";
import { PLANNING_LIMITS } from "../constants";

/**
 * M13 slice E — the model's structured response to a conversational
 * modification request, replacing the M08/slice-D `ModificationProposal`'s
 * boolean `clarificationNeeded` (docs/appbuilder-m13-multimodal-contextual-
 * assistant.md, "Intent and capability contract"):
 *
 *   type ModificationDecision =
 *     | { outcome: "ready"; ...; plan: PlannedStep[]; assumptions: Assumption[] }
 *     | { outcome: "needs_clarification"; question }
 *     | { outcome: "partially_supported"; plan; unsupported }
 *     | { outcome: "unsupported"; unsupported; alternatives }
 *
 * `needs_clarification` is a PAUSE, never a failure — the pipeline persists
 * the question and resumes the same job once answered (lib/modification/
 * pipeline.ts). `ready`/`partially_supported` reuse M07's OperationBatch/
 * Operation union verbatim for every step's `batch` — never a parallel
 * operation vocabulary — so each step still goes through the exact same
 * dry-run/validate/version/preview/destructive-confirmation machinery a
 * single-step job always has (lib/modification/pipeline.ts's phase runner).
 */

export const ModificationAssumption = z.object({
  /** Plain language, e.g. "I matched 'Home' to the only page title with that value." */
  statement: z.string().min(1).max(300),
  targetId: z.string().max(200).optional(),
});
export type ModificationAssumptionType = z.infer<typeof ModificationAssumption>;

export const ModificationPlanStep = z.object({
  title: z.string().min(1).max(150),
  batch: OperationBatch,
});
export type ModificationPlanStepType = z.infer<typeof ModificationPlanStep>;

export const ModificationCapabilityGap = z.object({
  /** What the user asked for that this item covers, in plain language. */
  requested: z.string().min(1).max(300),
  /** Why it cannot be represented today. */
  reason: z.string().min(1).max(300),
  classification: z.enum(["schema", "component", "integration", "flag"]),
});
export type ModificationCapabilityGapType = z.infer<typeof ModificationCapabilityGap>;

export const ModificationSupportedAlternative = z.object({
  description: z.string().min(1).max(300),
});
export type ModificationSupportedAlternativeType = z.infer<typeof ModificationSupportedAlternative>;

/** A single bounded follow-up request may be answered by a plan of at most this many steps — conversational edits stay local, never an app rebuild. */
export const MAX_MODIFICATION_PLAN_STEPS = 6;

const summaryText = z.string().min(1).max(PLANNING_LIMITS.MAX_REASONING_SUMMARY_LENGTH);
const plan = z.array(ModificationPlanStep).min(1).max(MAX_MODIFICATION_PLAN_STEPS);
const assumptions = z.array(ModificationAssumption).max(5).default([]);
const unsupported = z.array(ModificationCapabilityGap).min(1).max(10);

export const ModificationDecisionReady = z.object({
  outcome: z.literal("ready"),
  summary: summaryText,
  assumptions,
  plan,
});
export type ModificationDecisionReadyType = z.infer<typeof ModificationDecisionReady>;

export const ModificationDecisionNeedsClarification = z.object({
  outcome: z.literal("needs_clarification"),
  question: ModificationClarificationQuestion,
});
export type ModificationDecisionNeedsClarificationType = z.infer<typeof ModificationDecisionNeedsClarification>;

export const ModificationDecisionPartiallySupported = z.object({
  outcome: z.literal("partially_supported"),
  summary: summaryText,
  assumptions,
  plan,
  unsupported,
});
export type ModificationDecisionPartiallySupportedType = z.infer<typeof ModificationDecisionPartiallySupported>;

export const ModificationDecisionUnsupported = z.object({
  outcome: z.literal("unsupported"),
  unsupported,
  alternatives: z.array(ModificationSupportedAlternative).max(5).default([]),
});
export type ModificationDecisionUnsupportedType = z.infer<typeof ModificationDecisionUnsupported>;

export const ModificationDecision = z.discriminatedUnion("outcome", [
  ModificationDecisionReady,
  ModificationDecisionNeedsClarification,
  ModificationDecisionPartiallySupported,
  ModificationDecisionUnsupported,
]);
export type ModificationDecisionType = z.infer<typeof ModificationDecision>;

/** Total operations across every step of a `ready`/`partially_supported` plan; 0 for the other two outcomes. */
export function countDecisionOperations(decision: ModificationDecisionType): number {
  if (decision.outcome === "ready" || decision.outcome === "partially_supported") {
    return decision.plan.reduce((sum, step) => sum + step.batch.operations.length, 0);
  }
  return 0;
}

export type { OperationBatchType };
