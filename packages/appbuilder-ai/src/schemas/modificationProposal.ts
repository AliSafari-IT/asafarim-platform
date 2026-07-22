import { z } from "zod";
import { OperationBatch, type OperationBatchType } from "./operationProposal";
import { PLANNING_LIMITS } from "../constants";

/**
 * The model's response to a single bounded conversational modification
 * request. Combines "what I understood you're asking for" (`summary` — the
 * text shown to the user as the assistant's proposal message) with the
 * actual proposed change (`batch`, reusing M07's OperationBatch/Operation
 * union verbatim — never a parallel operation vocabulary). There is no
 * separate multi-iteration planning loop here (unlike M07's
 * proposeOperations, which may be called many times per job): a
 * conversational edit is answered in one call, matching the issue's scope
 * ("a focused builder UI and reversible conversational edits", not a second
 * app-generation pipeline).
 *
 * `clarificationNeeded` covers the case where the request is too ambiguous
 * to safely act on (e.g. "make it better") — the model returns an empty
 * batch and explains what's missing in `summary`; M08 deliberately does not
 * build a full multi-round clarification state machine for this (that
 * exists only for M07's initial generation) — an ambiguous conversational
 * request simply fails safely with a message asking the user to be more
 * specific, which they can do by sending another message.
 */
export const ModificationProposal = z.object({
  summary: z.string().min(1).max(PLANNING_LIMITS.MAX_REASONING_SUMMARY_LENGTH),
  clarificationNeeded: z.boolean().default(false),
  batch: OperationBatch,
});
export type ModificationProposalType = z.infer<typeof ModificationProposal>;

export function countModificationOperations(proposal: ModificationProposalType): number {
  return proposal.batch.operations.length;
}

export type { OperationBatchType };
