import { z } from "zod";
import { OperationBatch, type OperationBatchType } from "./operationProposal";
import { PLANNING_LIMITS } from "../constants";

/**
 * The model's response to a single bounded M10 repair request — answering
 * ONE classified, repairable validation-gate failure with a proposed batch
 * of allowlisted M04 operations. Deliberately reuses `OperationBatch`
 * verbatim (the same vocabulary `proposeOperations`/`proposeModification`
 * already validate against) rather than inventing a parallel "repair
 * operation" shape — a repair is not a different kind of change, only a
 * different reason one is being proposed.
 *
 * `repairable` is the model's own opinion and is never trusted alone: the
 * repair pipeline (lib/repair/pipeline.ts) always cross-checks it against
 * `lib/repair/classify.ts`'s own closed classification before ever calling
 * the provider, and refuses to attempt a repair for a classification the
 * pipeline itself has already decided is not repairable (infrastructure
 * failure, flaky test, cancellation) regardless of what the model claims.
 * If the model itself judges the failure unfixable within the allowlisted
 * operation vocabulary, it returns `repairable: false` with an empty batch
 * and explains why in `summary` — this is a normal, expected outcome
 * (`unsupported_product_capability`), not a provider error.
 */
export const RepairProposal = z.object({
  summary: z.string().min(1).max(PLANNING_LIMITS.MAX_REASONING_SUMMARY_LENGTH),
  repairable: z.boolean().default(true),
  batch: OperationBatch,
});
export type RepairProposalType = z.infer<typeof RepairProposal>;

export function countRepairOperations(proposal: RepairProposalType): number {
  return proposal.batch.operations.length;
}

export type { OperationBatchType };
