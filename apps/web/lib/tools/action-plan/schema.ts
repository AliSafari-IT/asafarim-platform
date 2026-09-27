import { z } from "zod";

/**
 * Notes → Action Plan contracts (#676). Versioned: bump
 * ACTION_PLAN_SCHEMA_VERSION on any breaking change to input or output.
 *
 * There is deliberately no field for an assignee, owner, due date, or
 * deadline anywhere in these schemas: the tool drafts a plan for a person to
 * review, it never commits anyone to anything. `.strict()` keeps a model
 * from adding one.
 */
export const ACTION_PLAN_SCHEMA_VERSION = "action-plan/1";

export const PLANNING_DEPTHS = ["outline", "standard", "detailed"] as const;
export type PlanningDepth = (typeof PLANNING_DEPTHS)[number];

export const DEPTH_LABELS: Record<PlanningDepth, string> = {
  outline: "Outline: the main tasks only",
  standard: "Standard: tasks, dependencies, and risks",
  detailed: "Detailed: smaller tasks with effort ranges",
};

/**
 * Where every item comes from (the issue's four-way distinction):
 * - `fact`: stated in the notes; cites note units (N1…)
 * - `constraint`: something the user gave in the optional fields; cites C1…
 * - `inference`: the AI's reading of the notes; states its assumption
 * - `recommendation`: a suggestion the notes don't make; states its reason
 */
export const BASES = ["fact", "constraint", "inference", "recommendation"] as const;
export type Basis = (typeof BASES)[number];

export const BASIS_LABELS: Record<Basis, { label: string; description: string }> = {
  fact: { label: "From your text", description: "Quotes the part of your notes it came from." },
  constraint: { label: "Your constraint", description: "Comes from the outcome, horizon, or participants you gave." },
  inference: { label: "Inferred", description: "The AI's reading of your notes, not something they say directly." },
  recommendation: { label: "Suggestion", description: "Not in your notes: a suggestion to consider." },
};

export const EFFORT_UNITS = ["hours", "days"] as const;

export const NOTES_LIMITS = { min: 40, max: 10_000 } as const;

// ── Input ────────────────────────────────────────────────────────────────────
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is over the ${max.toLocaleString("en")}-character limit.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const actionPlanInputSchema = z
  .object({
    notes: z
      .string()
      .trim()
      .min(NOTES_LIMITS.min, `Add a little more detail — at least ${NOTES_LIMITS.min} characters.`)
      .max(NOTES_LIMITS.max, `The notes are over the ${NOTES_LIMITS.max.toLocaleString("en")}-character limit.`),
    outcome: optionalText(300, "The desired outcome"),
    horizon: optionalText(100, "The horizon"),
    participants: optionalText(500, "The participants"),
    depth: z.enum(PLANNING_DEPTHS).default("standard"),
  })
  .strict();
export type ActionPlanInput = z.output<typeof actionPlanInputSchema>;
/** What the browser sends (before trimming and empty-field removal). */
export type ActionPlanInputRaw = z.input<typeof actionPlanInputSchema>;

// ── Output ───────────────────────────────────────────────────────────────────
export const TASK_ID = /^T\d{1,2}$/;
export const SOURCE_ID = /^[NC]\d{1,3}$/;

const shortText = z.string().trim().min(1).max(300);
const longText = z.string().trim().min(1).max(1_000);
const sourceIds = z.array(z.string().regex(SOURCE_ID)).max(10);

/** Shared provenance fields and their rules. */
const provenance = {
  basis: z.enum(BASES),
  sourceIds,
  /** Required for inference (the assumption) and recommendation (the reason). */
  rationale: z.string().trim().max(300).optional(),
};

function checkProvenance(item: { basis: Basis; sourceIds: string[]; rationale?: string }, ctx: z.RefinementCtx) {
  const notes = item.sourceIds.filter((id) => id.startsWith("N"));
  const constraints = item.sourceIds.filter((id) => id.startsWith("C"));
  if (item.basis === "fact" && !notes.length) {
    ctx.addIssue({ code: "custom", message: "facts must cite the notes", path: ["sourceIds"] });
  }
  if (item.basis === "constraint" && !constraints.length) {
    ctx.addIssue({ code: "custom", message: "constraints must cite a constraint", path: ["sourceIds"] });
  }
  if ((item.basis === "inference" || item.basis === "recommendation") && !item.rationale) {
    ctx.addIssue({ code: "custom", message: `${item.basis}s must state their rationale`, path: ["rationale"] });
  }
}

export const effortSchema = z
  .object({ low: z.number().positive().max(1_000), high: z.number().positive().max(1_000), unit: z.enum(EFFORT_UNITS) })
  .strict()
  .refine((e) => e.low <= e.high, "effort low must not exceed high");
export type Effort = z.output<typeof effortSchema>;

export const taskSchema = z
  .object({
    id: z.string().regex(TASK_ID),
    title: shortText,
    description: z.string().trim().max(1_000),
    /** Always an estimate. Absent when the depth or the notes don't support one. */
    effort: effortSchema.optional(),
    ...provenance,
  })
  .strict()
  .superRefine(checkProvenance);
export type PlanTask = z.output<typeof taskSchema>;

export const dependencySchema = z
  .object({
    id: z.string().regex(/^E\d{1,3}$/),
    /** Must be done first. */
    from: z.string().regex(TASK_ID),
    /** Waits for `from`. */
    to: z.string().regex(TASK_ID),
    reason: shortText,
    ...provenance,
  })
  .strict()
  .superRefine(checkProvenance);
export type Dependency = z.output<typeof dependencySchema>;

export const riskSchema = z
  .object({ id: z.string().regex(/^R\d{1,2}$/), risk: longText, mitigation: z.string().trim().max(300).optional(), ...provenance })
  .strict()
  .superRefine(checkProvenance);
export type Risk = z.output<typeof riskSchema>;

/** Decisions already made. Only what the notes say, so always a fact. */
export const decisionSchema = z
  .object({ id: z.string().regex(/^D\d{1,2}$/), decision: longText, basis: z.literal("fact"), sourceIds: sourceIds.min(1) })
  .strict();
export type Decision = z.output<typeof decisionSchema>;

export const questionSchema = z.object({ id: z.string().regex(/^Q\d{1,2}$/), question: longText, sourceIds }).strict();
export type PlanQuestion = z.output<typeof questionSchema>;

/** A checkpoint made of tasks. Never a date. */
export const milestoneSchema = z
  .object({ id: z.string().regex(/^M\d{1,2}$/), title: shortText, taskIds: z.array(z.string().regex(TASK_ID)).min(1).max(40), ...provenance })
  .strict()
  .superRefine(checkProvenance);
export type Milestone = z.output<typeof milestoneSchema>;

export const sourceUnitSchema = z
  .object({
    id: z.string().regex(SOURCE_ID),
    text: z.string().min(1).max(400),
    field: z.enum(["notes", "outcome", "horizon", "participants"]),
  })
  .strict();

export const actionPlanSchema = z
  .object({
    schemaVersion: z.literal(ACTION_PLAN_SCHEMA_VERSION),
    title: shortText,
    objective: longText,
    scope: longText,
    sources: z.array(sourceUnitSchema).min(1).max(80),
    /** In suggested order. */
    tasks: z.array(taskSchema).min(1).max(40),
    dependencies: z.array(dependencySchema).max(80),
    risks: z.array(riskSchema).max(20),
    decisions: z.array(decisionSchema).max(20),
    questions: z.array(questionSchema).max(20),
    milestones: z.array(milestoneSchema).max(10),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const known = new Set(plan.sources.map((s) => s.id));
    const cite = (ids: string[], path: (string | number)[]) => {
      for (const id of ids) if (!known.has(id)) ctx.addIssue({ code: "custom", message: `unknown source ${id}`, path });
    };
    const taskIds = new Set<string>();
    plan.tasks.forEach((t, i) => {
      if (taskIds.has(t.id)) ctx.addIssue({ code: "custom", message: `duplicate task id ${t.id}`, path: ["tasks", i, "id"] });
      taskIds.add(t.id);
      cite(t.sourceIds, ["tasks", i, "sourceIds"]);
    });
    for (const issue of dependencyIssues(plan.dependencies, taskIds)) ctx.addIssue({ code: "custom", message: issue.message, path: ["dependencies", issue.index] });
    plan.dependencies.forEach((d, i) => cite(d.sourceIds, ["dependencies", i, "sourceIds"]));
    plan.risks.forEach((r, i) => cite(r.sourceIds, ["risks", i, "sourceIds"]));
    plan.decisions.forEach((d, i) => cite(d.sourceIds, ["decisions", i, "sourceIds"]));
    plan.questions.forEach((q, i) => cite(q.sourceIds, ["questions", i, "sourceIds"]));
    plan.milestones.forEach((m, i) => {
      cite(m.sourceIds, ["milestones", i, "sourceIds"]);
      for (const id of m.taskIds) if (!taskIds.has(id)) ctx.addIssue({ code: "custom", message: `unknown task ${id}`, path: ["milestones", i, "taskIds"] });
    });
  });
export type ActionPlan = z.output<typeof actionPlanSchema>;
export type SourceUnit = z.output<typeof sourceUnitSchema>;

/**
 * Dangling ids, self-edges, duplicate edges, and cycles, in order. Shared by
 * the output schema, the server's clean-up of model output, and the editor
 * (which refuses an edit that would introduce one).
 */
export function dependencyIssues(edges: readonly Pick<Dependency, "from" | "to">[], taskIds: ReadonlySet<string>): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  const seen = new Set<string>();
  const accepted: Pick<Dependency, "from" | "to">[] = [];
  edges.forEach((e, index) => {
    const key = `${e.from}>${e.to}`;
    if (!taskIds.has(e.from) || !taskIds.has(e.to)) issues.push({ index, message: `dependency ${key} refers to a task that doesn't exist` });
    else if (e.from === e.to) issues.push({ index, message: `task ${e.from} can't depend on itself` });
    else if (seen.has(key)) issues.push({ index, message: `dependency ${key} is listed twice` });
    else if (reaches(accepted, e.to, e.from)) issues.push({ index, message: `dependency ${key} would create a cycle` });
    else {
      seen.add(key);
      accepted.push(e);
    }
  });
  return issues;
}

/** Whether `target` can be reached from `start` by following edges forwards. */
export function reaches(edges: readonly Pick<Dependency, "from" | "to">[], start: string, target: string): boolean {
  const stack = [start];
  const visited = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const e of edges) if (e.from === node) stack.push(e.to);
  }
  return false;
}

// ── What the model returns (ids for sources and items added by the server) ───
const modelProvenance = { basis: z.enum(BASES), sourceIds: z.array(z.string()), rationale: z.string() };

export const modelOutputSchema = z.object({
  title: z.string(),
  objective: z.string(),
  scope: z.string(),
  tasks: z.array(
    z.object({
      /** The model's own key, used only so dependencies and milestones can refer to tasks. */
      key: z.string(),
      title: z.string(),
      description: z.string(),
      effort: z.object({ low: z.number(), high: z.number(), unit: z.enum(EFFORT_UNITS) }).nullable(),
      ...modelProvenance,
    })
  ),
  dependencies: z.array(z.object({ from: z.string(), to: z.string(), reason: z.string(), ...modelProvenance })),
  risks: z.array(z.object({ risk: z.string(), mitigation: z.string(), ...modelProvenance })),
  decisions: z.array(z.object({ decision: z.string(), sourceIds: z.array(z.string()) })),
  questions: z.array(z.object({ question: z.string(), sourceIds: z.array(z.string()) })),
  milestones: z.array(z.object({ title: z.string(), taskKeys: z.array(z.string()), ...modelProvenance })),
});
export type ModelOutput = z.output<typeof modelOutputSchema>;
