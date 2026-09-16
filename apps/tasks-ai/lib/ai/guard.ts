import {
  TARGET_TASK_REF,
  operationSchema,
  proposalDraftSchema,
  type Operation,
  type ProposalDraft,
} from "./types";

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

export interface GuardOptions {
  /**
   * True when the job targets an existing task, which makes TARGET_TASK_REF
   * a resolvable ref. When false, an operation that names it — or any
   * update_task at all — could only ever address a task that does not
   * exist, so the draft is refused rather than applied as a silent no-op
   * (PR #377 review).
   */
  hasTargetTask?: boolean;
  /**
   * Ids of the retrieved context snippets the model was actually given
   * (issue #232), e.g. "task:cimr...". A citation.source that names
   * something outside this set is not evidence — the model could invent an
   * id despite instructions — so it does not count toward groundedRatio.
   * Unlike an unknown ref/parentRef/taskId elsewhere in this file, a
   * hallucinated source is not rejected outright: it is simply treated as
   * ungrounded, the same as an omitted citation, because it does not touch
   * the blast-radius/allowlist safety this function otherwise enforces.
   */
  retrievedIds?: Set<string>;
}

export function guardDraft(
  raw: unknown,
  maxBlastRadius: number,
  options: GuardOptions = {},
): GuardResult {
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

  // Refs must be unique and links must point at known refs. The target task,
  // when there is one, is the single ref that resolves to something the
  // proposal did not create.
  const refs = new Set<string>();
  if (options.hasTargetTask) refs.add(TARGET_TASK_REF);
  for (const op of draft.operations) {
    if (op.op === "create_task") {
      if (op.ref === TARGET_TASK_REF) reasons.push(`${TARGET_TASK_REF} is reserved and cannot be created`);
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
    if (op.op === "update_task") {
      // The only existing task a draft may address is the one the job was
      // scoped to. Any other id is a guess, and a guess that misses is
      // applied as nothing while the review claimed an edit.
      if (!options.hasTargetTask) {
        reasons.push("update_task without a target task: nothing it could address exists");
      } else if (op.taskId !== TARGET_TASK_REF) {
        reasons.push(`update_task must address ${TARGET_TASK_REF}, not an invented task id`);
      }
    }
  }

  if (reasons.length) throw new GuardError(reasons);

  const retrievedIds = options.retrievedIds ?? new Set<string>();
  const facts = draft.operations.flatMap((o: Operation) => o.citations);
  const grounded = facts.filter(
    (c) =>
      (c.span !== null && !c.assumption) ||
      (c.source != null && retrievedIds.has(c.source)),
  ).length;
  return {
    draft,
    operationCount: draft.operations.length,
    groundedRatio: facts.length ? grounded / facts.length : 1,
  };
}
