import { z } from "zod";
import { Operation, type OperationType } from "@asafarim/appbuilder-schema";
import { PLANNING_LIMITS } from "../constants";

/**
 * One proposed operation plus the model's own claim about whether it is
 * destructive. That claim is NEVER trusted as authoritative — the pipeline
 * always re-derives destructiveness itself via
 * @asafarim/appbuilder-schema's classifyDestructiveChange (run inside
 * applySpecOperation/applyOperation) and always requires a separate,
 * explicit user confirmation before a destructive change is applied.
 * `modelBelievesDestructive` exists only so the pipeline can flag a
 * mismatch (model said safe, engine says destructive) as a planning
 * anomaly worth surfacing to operators.
 *
 * Deliberately absent from this shape: any field resembling M04's
 * `confirmDestructive` flag. The model has no channel through which it can
 * self-approve a destructive change — see docs/appbuilder-m07-ai-generation.md
 * "Destructive confirmation".
 */
export const ProposedOperation = z.object({
  operation: Operation,
  modelBelievesDestructive: z.boolean().default(false),
});
export type ProposedOperationType = z.infer<typeof ProposedOperation>;

/**
 * A single bounded batch of proposed operations. Enforced both here
 * (structural cap) and again by the pipeline against the job's running
 * total (MAX_TOTAL_OPERATIONS) and iteration count (MAX_PLANNING_ITERATIONS)
 * — two independent limits so a provider bug that ignores the batch cap
 * still cannot exceed the job-wide budget.
 */
export const OperationBatch = z.object({
  /** May be empty when isFinalBatch=true and the template already covers the requirements. */
  operations: z.array(ProposedOperation).max(PLANNING_LIMITS.MAX_OPERATIONS_PER_BATCH),
  reasoningSummary: z.string().min(1).max(PLANNING_LIMITS.MAX_REASONING_SUMMARY_LENGTH),
  /** True when the model believes the app is fully specified after this batch. */
  isFinalBatch: z.boolean(),
});
export type OperationBatchType = z.infer<typeof OperationBatch>;

export function countOperations(batch: OperationBatchType): number {
  return batch.operations.length;
}

export type { OperationType };
