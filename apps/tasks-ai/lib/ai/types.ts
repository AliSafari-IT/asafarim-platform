import { z } from "zod";

/**
 * The AI boundary contract (docs/adr/0004-ai-proposal-model.md).
 *
 * A provider returns a `ProposalDraft`: a set of operations drawn from a
 * fixed allowlist, each fact carrying a citation (a span of the input) or
 * an explicit `assumption` flag, plus a confidence. Nothing outside this
 * shape — and nothing outside the entity/field allowlist — is ever applied.
 */

export const AI_KINDS = [
  "extract_plan",
  "decompose",
  "acceptance_criteria",
  "summarize",
  "nl_query",
  // Testora → TasksAI: triage an automated e2e failure into an audited,
  // reviewable proposal (issue #264). Still a create_task op — no new
  // operation type is introduced.
  "test_diagnosis",
  // Thinking-partner kinds (issue #233): summary/openQuestions-first, at
  // most one operation, so they stay inside the M06 boundary with no new
  // operation type.
  "risks_open_questions",
  "project_brief",
  "changed_digest",
  // Cross-project duplicate detection (issue #234): still only a
  // link_tasks(kind=duplicates) op — no new operation type — but its "to"
  // endpoint is an existing task outside the proposal, found via retrieval,
  // rather than one this proposal created. See CANDIDATE_REF_PREFIX.
  "dedup",
] as const;
export type AiKind = (typeof AI_KINDS)[number];

/**
 * The one ref that resolves to a task the proposal did not create: the
 * existing task a task-scoped draft was launched from ("break this into
 * subtasks", "draft acceptance criteria for this"). Refs are otherwise
 * proposal-local, so without it a task-scoped draft had no way to say
 * "parent these under the task I was opened from" and silently produced
 * top-level tasks or an update against a task id that does not exist
 * (PR #377 review).
 */
export const TARGET_TASK_REF = "__target_task__";

/**
 * A second class of ref, distinct from TARGET_TASK_REF: an existing task
 * found via retrieval (issue #234, e.g. a `dedup` candidate) rather than the
 * one task a draft was opened from. `"task:<id>"` reuses the exact id shape
 * `retrieveContext()`/citations already use, so the same retrieved-id set
 * that grounds a citation also authorizes a link_tasks endpoint — a ref
 * naming a task the retrieval step never returned is not a link target, the
 * same way a citation.source outside that set is not evidence (guard.ts).
 * Reserved: a create_task op may not claim a ref in this namespace.
 */
export const CANDIDATE_REF_PREFIX = "task:";
export function isCandidateRef(ref: string): boolean {
  return ref.startsWith(CANDIDATE_REF_PREFIX);
}

/**
 * Operations AI may propose. NOTHING else is representable.
 *
 * The last four (issue #235) widen the allowlist beyond create/update/link
 * while keeping every ADR-0004 hard prohibition true by construction: none
 * of their schemas below has a field for an assignee, a message, a delete,
 * or (for status/due-date) the *committed* field — `suggest_status` and
 * `suggest_due_date` write only the separate `suggestedStatusId` /
 * `suggestedDueDate` columns, never `statusId` / `dueDate` themselves.
 */
export const OP_TYPES = [
  "create_task",
  "update_task",
  "link_tasks",
  "set_labels",
  "suggest_status",
  "set_dependency",
  "suggest_due_date",
] as const;
export type OpType = (typeof OP_TYPES)[number];

/** Fields AI may set on create/update. `assignee`, `dates`, roles, billing
 *  are deliberately absent — see ADR-0004 hard prohibitions. */
export const CREATABLE_FIELDS = ["title", "description", "estimate", "parentRef"] as const;
export const UPDATABLE_FIELDS = ["title", "description", "estimate"] as const;

const citation = z.object({
  /** character span in the source input, or null when this is an assumption */
  span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
  assumption: z.boolean().default(false),
  quote: z.string().max(400).optional(),
  /**
   * A retrieved entity this fact is grounded in, e.g. "task:cimr..." — the
   * id of a `[RELATED ...]` snippet the model was actually given (issue
   * #232). Alternative to `span` for facts drawn from retrieved context
   * rather than the pasted input. guardDraft() rejects/downgrades a
   * `source` that was never in the retrieved set, since the model could
   * still invent one despite instructions.
   */
  source: z
    .string()
    .regex(/^(task|comment|project):[A-Za-z0-9_-]+$/)
    .optional(),
});

const createOp = z.object({
  op: z.literal("create_task"),
  /** client-local ref so later ops can link to a not-yet-created task */
  ref: z.string().min(1).max(40),
  fields: z
    .object({
      title: z.string().min(1).max(500),
      description: z.string().max(20000).optional(),
      estimate: z.number().nonnegative().optional(),
      parentRef: z.string().max(40).optional(),
    })
    .strict(),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

const updateOp = z.object({
  op: z.literal("update_task"),
  taskId: z.string().min(1),
  fields: z
    .object({
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(20000).optional(),
      estimate: z.number().nonnegative().optional(),
    })
    .strict(),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

const linkOp = z.object({
  op: z.literal("link_tasks"),
  fromRef: z.string().min(1).max(40),
  toRef: z.string().min(1).max(40),
  kind: z.enum(["blocks", "relates", "duplicates"]),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

/**
 * Adds/removes label ids on a task (issue #235). Unlike `suggest_status`/
 * `suggest_due_date` below, this is not a "suggestion" field — applying it
 * IS the confirmed action, no differently than `update_task`'s title/
 * description: the human already confirmed it by approving this op in
 * review. `taskId` is restricted the same way `update_task.taskId` is
 * (guard.ts): only the proposal's own target task, never an invented id.
 */
const setLabelsOp = z.object({
  op: z.literal("set_labels"),
  taskId: z.string().min(1),
  fields: z
    .object({
      add: z.array(z.string().min(1).max(60)).max(20).default([]),
      remove: z.array(z.string().min(1).max(60)).max(20).default([]),
    })
    .strict()
    .refine((f) => f.add.length + f.remove.length > 0, "add or remove must be non-empty"),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

/**
 * Records a *suggested* status transition (issue #235) — never the
 * committed `Task.statusId`. Promoting a suggestion to the committed status
 * is a distinct human action outside proposal apply, the same non-commit
 * boundary as `suggest_due_date` below.
 */
const suggestStatusOp = z.object({
  op: z.literal("suggest_status"),
  taskId: z.string().min(1),
  statusId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

/**
 * A directional dependency edge (issue #235) — a superset of `link_tasks`'s
 * "blocks" kind that also accepts the inverse direction, so a draft can say
 * "fromRef is blocked by toRef" without inventing a reversed blocks op.
 * Endpoints resolve exactly like `link_tasks`'s (a create_task ref, the
 * target-task ref, or a retrieved candidate ref — see guard.ts).
 */
const setDependencyOp = z.object({
  op: z.literal("set_dependency"),
  fromRef: z.string().min(1).max(40),
  toRef: z.string().min(1).max(40),
  kind: z.enum(["blocks", "blocked_by"]),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

/**
 * Records a *suggested* due date (issue #235) into `suggestedDueDate` —
 * never the committed `Task.dueDate`. ADR-0004's "AI never writes a
 * committed date" hard prohibition holds because this field is not that
 * field; promoting it is a separate human action.
 */
const suggestDueDateOp = z.object({
  op: z.literal("suggest_due_date"),
  taskId: z.string().min(1),
  dueDate: z.string().datetime({ offset: true }),
  confidence: z.number().min(0).max(1),
  citations: z.array(citation).max(20),
});

export const operationSchema = z.discriminatedUnion("op", [
  createOp,
  updateOp,
  linkOp,
  setLabelsOp,
  suggestStatusOp,
  setDependencyOp,
  suggestDueDateOp,
]);
export type Operation = z.infer<typeof operationSchema>;

export const proposalDraftSchema = z.object({
  summary: z.string().max(2000),
  operations: z.array(operationSchema).max(200),
  openQuestions: z.array(z.string().max(500)).max(20).default([]),
});
export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

export interface AiRequest {
  kind: AiKind;
  /** Untrusted user text (notes, brief, thread). Redacted before send. */
  input: string;
  /** Least-data tenant context the model may see. */
  context?: {
    projectName?: string;
    existingTaskTitles?: string[];
    /**
     * The existing task a task-scoped draft targets, if any. Only the title
     * reaches the provider; the id scopes the prompt cache so two tasks that
     * happen to share a title never share a draft.
     */
    targetTask?: { id: string; title: string };
    /**
     * Redacted snippets retrieved for grounding (issue #232) — task/comment/
     * project entries the model may cite via `citation.source`. Rendered
     * inside the untrusted fence in prompts.ts, never outside it.
     */
    retrieved?: { id: string; title: string; body: string }[];
  };
}

export interface AiResult {
  draft: ProposalDraft;
  usage: { inputTokens: number; outputTokens: number; costUsd: number; fixture: boolean };
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  degraded?: boolean;
}
