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
] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** Operations AI may propose. NOTHING else is representable. */
export const OP_TYPES = ["create_task", "update_task", "link_tasks"] as const;
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

export const operationSchema = z.discriminatedUnion("op", [createOp, updateOp, linkOp]);
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
  context?: { projectName?: string; existingTaskTitles?: string[] };
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
