import { z } from "zod";
import { PLANNING_LIMITS, CONFIDENCE_LEVELS } from "../constants";

const shortText = z.string().min(1).max(PLANNING_LIMITS.MAX_SHORT_STRING);
const mediumText = z.string().min(1).max(PLANNING_LIMITS.MAX_MEDIUM_STRING);

/**
 * A described entity is NOT a schema-package Entity — it is the model's
 * informal read of "there should be a thing called X with fields like Y".
 * The generation pipeline's operation-proposal phase is responsible for
 * turning this into real, id-bearing, validated CREATE_ENTITY/ADD_FIELD
 * operations. Keeping these separate is deliberate: this schema never
 * carries a StableId, a machine name, or anything the pure engine would
 * treat as authoritative.
 */
const DescribedField = z.object({
  name: shortText,
  purpose: mediumText.optional(),
});

const DescribedEntity = z.object({
  name: shortText,
  purpose: mediumText.optional(),
  importantFields: z.array(DescribedField).max(PLANNING_LIMITS.MAX_FIELDS_PER_ENTITY_DESCRIBED).default([]),
});

const DescribedRelationship = z.object({
  fromEntity: shortText,
  toEntity: shortText,
  cardinality: z.enum(["oneToOne", "oneToMany", "manyToMany"]),
  description: mediumText.optional(),
});

const DescribedRole = z.object({
  name: shortText,
  accessSummary: mediumText.optional(),
});

const DescribedPage = z.object({
  name: shortText,
  purpose: mediumText.optional(),
  primaryEntity: shortText.optional(),
});

const DescribedDashboard = z.object({
  name: shortText,
  purpose: mediumText.optional(),
});

const DescribedWorkflow = z.object({
  name: shortText,
  trigger: mediumText.optional(),
  outcome: mediumText.optional(),
});

const DescribedFileNeed = z.object({
  entity: shortText.optional(),
  purpose: mediumText,
});

export const ClarificationQuestion = z.object({
  id: z.string().min(1).max(64),
  question: mediumText,
  /** Why the model can't safely proceed without an answer — shown to the owner/editor. */
  reason: mediumText.optional(),
});
export type ClarificationQuestionType = z.infer<typeof ClarificationQuestion>;

/**
 * Strict, bounded normalized-intent schema. This is the model's ONLY
 * structured-output contract for "what did the user ask for" — free text
 * from the user never reaches later phases directly, only through this
 * validated shape. Every array and string here is bounded so a malicious
 * or runaway prompt cannot balloon planning cost or downstream operation
 * count (see docs on prompt-injection resistance).
 */
export const RequirementsAnalysis = z.object({
  appPurpose: mediumText,
  targetUsers: z.array(shortText).max(PLANNING_LIMITS.MAX_TARGET_USERS).default([]),
  entities: z.array(DescribedEntity).max(PLANNING_LIMITS.MAX_ENTITIES_DESCRIBED).default([]),
  relationships: z.array(DescribedRelationship).max(PLANNING_LIMITS.MAX_RELATIONSHIPS_DESCRIBED).default([]),
  roles: z.array(DescribedRole).max(PLANNING_LIMITS.MAX_ROLES_DESCRIBED).default([]),
  pages: z.array(DescribedPage).max(PLANNING_LIMITS.MAX_PAGES_DESCRIBED).default([]),
  dashboards: z.array(DescribedDashboard).max(PLANNING_LIMITS.MAX_DASHBOARDS_DESCRIBED).default([]),
  workflows: z.array(DescribedWorkflow).max(PLANNING_LIMITS.MAX_WORKFLOWS_DESCRIBED).default([]),
  fileNeeds: z.array(DescribedFileNeed).max(PLANNING_LIMITS.MAX_FILE_NEEDS_DESCRIBED).default([]),
  assumptions: z.array(mediumText).max(PLANNING_LIMITS.MAX_ASSUMPTIONS).default([]),
  exclusions: z.array(mediumText).max(PLANNING_LIMITS.MAX_EXCLUSIONS).default([]),
  clarificationQuestions: z
    .array(ClarificationQuestion)
    .max(PLANNING_LIMITS.MAX_CLARIFICATION_QUESTIONS)
    .default([]),
  /** Confidence that `pages`/`entities` are complete enough to plan from without more clarification. */
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type RequirementsAnalysisType = z.infer<typeof RequirementsAnalysis>;

/**
 * True when the analysis judged itself unable to proceed safely — either it
 * self-reported low confidence, or it raised any clarification question.
 * The pipeline treats this as authoritative for the needs_clarification
 * transition; it never re-derives "is this ambiguous" itself.
 */
export function requiresClarification(analysis: RequirementsAnalysisType): boolean {
  return analysis.confidence === "low" || analysis.clarificationQuestions.length > 0;
}
