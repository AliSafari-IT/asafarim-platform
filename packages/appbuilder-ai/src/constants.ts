/**
 * M07 planning-time bounds. These are independent of and in addition to
 * @asafarim/appbuilder-schema's LIMITS (entity/field/page counts on the
 * resulting specification) — these bound the *planning process itself*:
 * how much untrusted prompt text the model sees, how many operations/
 * questions/iterations a single job may produce, and how large a single
 * provider call may be. Conservative MVP ceilings, not performance tuning —
 * a trust boundary against runaway cost and against a model trying to pad
 * its way past validation with sheer volume.
 */
export const PLANNING_LIMITS = {
  /** Untrusted user prompt, as stored on creation_requests.prompt. */
  MAX_PROMPT_LENGTH: 4_000,
  /** A single clarification answer. */
  MAX_CLARIFICATION_ANSWER_LENGTH: 2_000,

  MAX_TARGET_USERS: 10,
  MAX_ENTITIES_DESCRIBED: 30,
  MAX_FIELDS_PER_ENTITY_DESCRIBED: 40,
  MAX_RELATIONSHIPS_DESCRIBED: 60,
  MAX_ROLES_DESCRIBED: 10,
  MAX_PAGES_DESCRIBED: 40,
  MAX_DASHBOARDS_DESCRIBED: 10,
  MAX_WORKFLOWS_DESCRIBED: 20,
  MAX_FILE_NEEDS_DESCRIBED: 10,
  MAX_ASSUMPTIONS: 20,
  MAX_EXCLUSIONS: 20,
  MAX_SHORT_STRING: 200,
  MAX_MEDIUM_STRING: 1_000,

  /** Structured clarification questions returned in one round. */
  MAX_CLARIFICATION_QUESTIONS: 6,
  /** Clarification round-trips a single job may go through before failing safe. */
  MAX_CLARIFICATION_ROUNDS: 3,

  /** Operations proposed in a single provider tool-call batch. */
  MAX_OPERATIONS_PER_BATCH: 40,
  /** Total operations a single job may apply across all iterations. */
  MAX_TOTAL_OPERATIONS: 200,
  /** Planner iterations (analyze -> propose -> validate -> replan) per job. */
  MAX_PLANNING_ITERATIONS: 4,

  /** Reasoning/explanation strings the model may return alongside a decision. */
  MAX_REASONING_SUMMARY_LENGTH: 1_000,
} as const;

/** Bounded confidence scale the model must self-report on, never freeform. */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
