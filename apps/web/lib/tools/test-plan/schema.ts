import { z } from "zod";

/**
 * Requirements → Test Plan contracts (#675). Versioned: bump
 * TEST_PLAN_SCHEMA_VERSION on any breaking change to input or output.
 *
 * There is deliberately no field for execution status, pass/fail, or
 * coverage percentages anywhere in these schemas: the tool plans tests, it
 * never claims to have run them. `.strict()` keeps a model from adding one.
 */
export const TEST_PLAN_SCHEMA_VERSION = "test-plan/1";
/** Bumped on any user-visible behaviour change (the server adapter reports it). */
export const TEST_PLAN_TOOL_VERSION = "1.0.0";

export const TEST_CATEGORIES = [
  "happy_path",
  "boundary",
  "negative",
  "permissions_security",
  "accessibility",
  "resilience",
  "compatibility",
] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  happy_path: "Happy path",
  boundary: "Boundary",
  negative: "Negative / failure",
  permissions_security: "Permissions & security",
  accessibility: "Accessibility",
  resilience: "Resilience",
  compatibility: "Compatibility",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const QUESTION_KINDS = ["ambiguity", "contradiction", "missing"] as const;

export const REQUIREMENT_LIMITS = { min: 40, max: 8_000 } as const;

// ── Input ────────────────────────────────────────────────────────────────────
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is over the ${max.toLocaleString("en")}-character limit.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const testPlanInputSchema = z
  .object({
    requirement: z
      .string()
      .trim()
      .min(REQUIREMENT_LIMITS.min, `Add a little more detail — at least ${REQUIREMENT_LIMITS.min} characters.`)
      .max(REQUIREMENT_LIMITS.max, `The requirement is over the ${REQUIREMENT_LIMITS.max.toLocaleString("en")}-character limit.`),
    title: optionalText(120, "The title"),
    acceptanceCriteria: optionalText(4_000, "The acceptance criteria"),
    context: optionalText(1_500, "The product context"),
    platforms: optionalText(300, "The platform scope"),
  })
  .strict();
export type TestPlanInput = z.output<typeof testPlanInputSchema>;
/** What the browser sends (before trimming and empty-field removal). */
export type TestPlanInputRaw = z.input<typeof testPlanInputSchema>;

// ── Output ───────────────────────────────────────────────────────────────────
const shortText = z.string().trim().min(1).max(300);
const longText = z.string().trim().min(1).max(1_000);
const sourceIds = z.array(z.string().regex(/^R\d{1,3}$/)).max(10);

export const scenarioSchema = z
  .object({
    id: z.string().regex(/^TC-\d{2,3}$/),
    title: shortText,
    category: z.enum(TEST_CATEGORIES),
    priority: z.enum(PRIORITIES),
    /** "requirement" = traceable to source units; "inferred" = a risk the text doesn't state. */
    basis: z.enum(["requirement", "inferred"]),
    sourceIds,
    /** Required for inferred scenarios: what the scenario assumes. */
    assumption: z.string().trim().max(300).optional(),
    preconditions: z.array(shortText).max(8),
    steps: z.array(shortText).min(1).max(15),
    expected: longText,
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.basis === "requirement" && s.sourceIds.length === 0) {
      ctx.addIssue({ code: "custom", message: "requirement-based scenarios must cite a source", path: ["sourceIds"] });
    }
    if (s.basis === "inferred" && !s.assumption) {
      ctx.addIssue({ code: "custom", message: "inferred scenarios must state their assumption", path: ["assumption"] });
    }
  });
export type Scenario = z.output<typeof scenarioSchema>;

export const questionSchema = z
  .object({
    id: z.string().regex(/^Q\d{1,2}$/),
    kind: z.enum(QUESTION_KINDS),
    question: longText,
    sourceIds,
  })
  .strict();
export type OpenQuestion = z.output<typeof questionSchema>;

export const testPlanSchema = z
  .object({
    schemaVersion: z.literal(TEST_PLAN_SCHEMA_VERSION),
    title: shortText,
    summary: longText,
    actors: z.array(shortText).max(10),
    goals: z.array(shortText).max(10),
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^R\d{1,3}$/),
            text: z.string().min(1).max(400),
            field: z.enum(["requirement", "acceptanceCriteria"]),
          })
          .strict()
      )
      .min(1)
      .max(60),
    questions: z.array(questionSchema).max(20),
    scenarios: z.array(scenarioSchema).min(1).max(40),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const known = new Set(plan.sources.map((s) => s.id));
    const check = (ids: string[], path: (string | number)[]) => {
      for (const id of ids) if (!known.has(id)) ctx.addIssue({ code: "custom", message: `unknown source ${id}`, path });
    };
    plan.scenarios.forEach((s, i) => check(s.sourceIds, ["scenarios", i, "sourceIds"]));
    plan.questions.forEach((q, i) => check(q.sourceIds, ["questions", i, "sourceIds"]));
  });
export type TestPlan = z.output<typeof testPlanSchema>;

// ── What the model returns (ids and sources are added by the server) ─────────
export const modelScenarioSchema = z.object({
  title: z.string(),
  category: z.enum(TEST_CATEGORIES),
  priority: z.enum(PRIORITIES),
  basis: z.enum(["requirement", "inferred"]),
  sourceIds: z.array(z.string()),
  assumption: z.string(),
  preconditions: z.array(z.string()),
  steps: z.array(z.string()),
  expected: z.string(),
});

export const modelOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  actors: z.array(z.string()),
  goals: z.array(z.string()),
  questions: z.array(z.object({ kind: z.enum(QUESTION_KINDS), question: z.string(), sourceIds: z.array(z.string()) })),
  scenarios: z.array(modelScenarioSchema),
});
export type ModelOutput = z.output<typeof modelOutputSchema>;
