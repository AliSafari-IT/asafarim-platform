import { operationSchema, proposalDraftSchema, type Operation, type ProposalDraft } from "./types";

/**
 * The blast-radius + allowlist gate. A provider draft is re-validated here
 * before it is ever stored as a Proposal — the schema already restricts the
 * op shape; this adds the per-workspace size limit and a few semantic
 * checks that prompt injection could otherwise slip past.
 */
export class GuardError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`proposal rejected by guard: ${reasons.join("; ")}`);
    this.name = "GuardError";
    this.reasons = reasons;
  }
}

export interface GuardResult {
  draft: ProposalDraft;
  /** count of create+update+link ops — compared to maxBlastRadius */
  operationCount: number;
  groundedRatio: number;
}

export function guardDraft(raw: unknown, maxBlastRadius: number): GuardResult {
  const draft = proposalDraftSchema.parse(raw);
  const reasons: string[] = [];

  if (draft.operations.length > maxBlastRadius) {
    reasons.push(`${draft.operations.length} operations exceeds blast-radius limit ${maxBlastRadius}`);
  }

  // Every op must independently re-validate (defence in depth vs. a crafted
  // partial object).
  for (const op of draft.operations) {
    const r = operationSchema.safeParse(op);
    if (!r.success) reasons.push(`operation failed re-validation: ${r.error.issues[0]?.message}`);
  }

  // Refs must be unique and links must point at known refs.
  const refs = new Set<string>();
  for (const op of draft.operations) {
    if (op.op === "create_task") {
      if (refs.has(op.ref)) reasons.push(`duplicate ref ${op.ref}`);
      refs.add(op.ref);
    }
  }
  for (const op of draft.operations) {
    if (op.op === "create_task" && op.fields.parentRef && !refs.has(op.fields.parentRef)) {
      reasons.push(`parentRef ${op.fields.parentRef} has no matching create_task`);
    }
    if (op.op === "link_tasks" && (!refs.has(op.fromRef) || !refs.has(op.toRef))) {
      reasons.push(`link references an unknown ref`);
    }
  }

  if (reasons.length) throw new GuardError(reasons);

  const facts = draft.operations.flatMap((o: Operation) => o.citations);
  const grounded = facts.filter((c) => c.span !== null && !c.assumption).length;
  return {
    draft,
    operationCount: draft.operations.length,
    groundedRatio: facts.length ? grounded / facts.length : 1,
  };
}
