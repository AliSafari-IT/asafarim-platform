import type { ModificationAssumptionType, OperationBatchType } from "@asafarim/appbuilder-ai";

/**
 * M13 slice E — what `modificationJobs.normalizedRequest` actually holds
 * for one bounded step, whether that step is the sole step of an ordinary
 * `ready` decision or one step of a multi-step plan
 * (lib/repositories/modificationPlans.ts). Deliberately NOT the provider's
 * own `ModificationDecisionType` — a decision may describe several steps;
 * this is always exactly the one THIS job is executing, so
 * lib/modification/pipeline.ts's proposing/applying phases stay unchanged
 * from the pre-slice-E single-step shape (just `summary`/`assumptions`
 * instead of the old envelope's `clarificationNeeded`).
 */
export interface PersistedStepRequest {
  summary: string;
  assumptions: ModificationAssumptionType[];
  batch: OperationBatchType;
}
