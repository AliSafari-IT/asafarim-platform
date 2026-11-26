import { z } from "zod";

/**
 * The job fit assessment contract (#971): one versioned shape shared by the
 * fit display, the requirement details, the clarification flow and
 * tailoring (the low-fit gate and the gaps the CV must not claim).
 *
 * Two layers:
 *
 * 1. **Analysis** (`FitAnalysis`): the job's requirements and, for each,
 *    a judgment with citations into the candidate's own sources. Written by
 *    the AI (validated against server-owned inputs, validate.ts) or by the
 *    basic keyword check (keyword.ts). Persisted with its input provenance;
 *    never changed afterwards.
 * 2. **Overlay** (overlay.ts): the candidate's confirmed clarification
 *    answers and requirement corrections, applied deterministically on read.
 *    Then the rubric (rubric.ts) computes every number in code. The model
 *    never writes a score.
 *
 * Everything quoted from the posting or a source is untrusted data: shown
 * escaped, compared, or fenced in a prompt; never an instruction.
 */

export const FIT_CONTRACT_VERSION = "fit_assessment@1";

export const FIT_PRIORITIES = ["required", "preferred", "unclear"] as const;
export type FitPriority = (typeof FIT_PRIORITIES)[number];

export const FIT_CATEGORIES = [
  "skill",
  "experience",
  "education",
  "credential",
  "language",
  "location",
  "work_arrangement",
  "availability",
  "authorization",
  "other",
] as const;
export type FitCategory = (typeof FIT_CATEGORIES)[number];

/** Categories that are job-related constraints rather than background: a
 *  mandatory licence, a stated language level, where and how the work is
 *  done, availability and work authorisation. Shown under "Suitability". */
export const CONSTRAINT_CATEGORIES: ReadonlySet<FitCategory> = new Set([
  "credential",
  "language",
  "location",
  "work_arrangement",
  "availability",
  "authorization",
]);

export const FIT_JUDGMENTS = ["direct", "partial", "unknown", "unmet", "conflict"] as const;
/**
 * - direct: a source states it (or an equivalent the explanation names).
 * - partial: related or transferable experience; never counts as the
 *   identical skill or as a mandatory credential.
 * - unknown: nothing in the sources says either way. Never "ineligible".
 * - unmet: a source, or the candidate's own answer, says they do not have it.
 * - conflict: sources disagree; the candidate decides.
 */
export type FitJudgment = (typeof FIT_JUDGMENTS)[number];

export interface FitCitation {
  /** A source id from the server's own source list (`exp:2`, `skills`,
   *  `ev:<revision id>`, `pref:remote`, `answer:<id>`). */
  sourceId: string;
  /** Exact text from that source (checked by validate.ts). */
  quote: string;
}

export type FitFlag =
  /** The model claimed support without a citation that checks out. */
  | "unsupported_claim"
  /** A cited quote is not in the cited source, or the source is unknown. */
  | "invalid_citation"
  /** Direct support with no shared term and no named equivalence. */
  | "unexplained_match"
  /** A credential/degree/language/preference judged from the wrong kind of source. */
  | "wrong_source_kind"
  /** "Unmet" with no negative evidence: treated as unknown. */
  | "unmet_without_evidence"
  /** The model did not assess this requirement. */
  | "not_assessed"
  /** Partial support for a mandatory constraint: not counted as met. */
  | "partial_not_credential";

export interface FitRequirement {
  /** "req_" + 10 hex of sha256(normalised quote): stable across runs. */
  id: string;
  /** The requirement exactly as the posting words it. */
  quote: string;
  priority: FitPriority;
  category: FitCategory;
  /** Stated as a must (licence, language level, on-site…). Only matters
   *  for constraint categories and for "required"/"unclear" priority. */
  essential: boolean;
  /** Requirements sharing a group are alternatives ("A or B"): the group
   *  is met by its best member. Null: stands alone (AND). */
  groupId: string | null;
  /** True when the requirement looks like it asks about a protected trait
   *  (age, gender, nationality, religion, health…). Shown, never scored. */
  protectedTrait: boolean;
}

export interface FitAssessmentItem {
  requirementId: string;
  judgment: FitJudgment;
  citations: FitCitation[];
  /** One or two sentences, from the model or the keyword check. */
  explanation: string;
  /** A named equivalence ("Postgres" in the job ≈ "PostgreSQL" in the
   *  profile), both terms checked to appear in the quotes. */
  equivalence: { jobTerm: string; profileTerm: string } | null;
  flags: FitFlag[];
}

export interface FitCompleteness {
  /** The job text was longer than the analysis budget. */
  jobTruncated: boolean;
  /** Profile prose sentences left out to fit the budget (least relevant first). */
  profileSentencesOmitted: number;
  /** The model said it found more requirements than it could list, or the cap was hit. */
  requirementsCapped: boolean;
}

export interface FitValidationReport {
  /** Requirements dropped because their quote is not in the posting. */
  requirementsRejected: number;
  /** Citations dropped (unknown source, or quote not in the source). */
  citationsRejected: number;
  /** Judgments downgraded to unknown by a code check. */
  judgmentsDowngraded: number;
}

export type FitMethod = "ai" | "keyword";

export interface FitAnalysis {
  version: string;
  method: FitMethod;
  requirements: FitRequirement[];
  assessments: FitAssessmentItem[];
  completeness: FitCompleteness;
  validation: FitValidationReport;
}

/** A source the analysis may cite, as the server built it. */
export interface FitSource {
  id: string;
  kind: "profile" | "evidence" | "preference" | "answer";
  /** The full source text citations are checked against. */
  text: string;
  /** Short label for the UI, from the candidate's own data. */
  label: string;
}

// ─── Model output ────────────────────────────────────────────────────────

/** Bounds on what one reply may hold. */
export const MAX_MODEL_REQUIREMENTS = 30;
export const MAX_QUOTE_CHARS = 300;
export const MAX_EXPLANATION_CHARS = 320;
export const MAX_CITATIONS = 3;

const shortText = (max: number) => z.string().trim().min(1).max(max);

/**
 * What a provider must return. `.strict()` rejects unlisted fields. Keys
 * (`r1`, `r2`…) only link an assessment to a requirement inside one reply;
 * the stored id is derived from the quote in code.
 */
export const fitModelOutputSchema = z
  .object({
    requirements: z
      .array(
        z
          .object({
            key: shortText(12),
            quote: shortText(MAX_QUOTE_CHARS),
            priority: z.enum(FIT_PRIORITIES),
            category: z.enum(FIT_CATEGORIES),
            essential: z.boolean(),
            anyOf: shortText(12).nullable(),
          })
          .strict(),
      )
      .max(MAX_MODEL_REQUIREMENTS),
    moreRequirementsOmitted: z.boolean(),
    assessments: z
      .array(
        z
          .object({
            key: shortText(12),
            judgment: z.enum(FIT_JUDGMENTS),
            citations: z
              .array(z.object({ sourceId: shortText(80), quote: shortText(MAX_QUOTE_CHARS) }).strict())
              .max(MAX_CITATIONS),
            explanation: shortText(MAX_EXPLANATION_CHARS),
            equivalence: z.object({ jobTerm: shortText(80), profileTerm: shortText(80) }).strict().nullable(),
          })
          .strict(),
      )
      .max(MAX_MODEL_REQUIREMENTS),
  })
  .strict();

export type FitModelOutput = z.infer<typeof fitModelOutputSchema>;

export function parseFitModelOutput(input: unknown): FitModelOutput {
  return fitModelOutputSchema.parse(input);
}

// ─── Candidate input: answers and corrections ───────────────────────────

export type FitAnswerValue = "yes" | "no";

export interface FitAnswer {
  id: string;
  requirementId: string;
  answer: FitAnswerValue;
  /** "Yes": the confirmed evidence revision holding the candidate's words. */
  evidenceRevisionId: string | null;
  /** "Yes": the confirmed text, for the citation. */
  evidenceText: string | null;
  createdAt: string;
}

export type FitCorrectionAction = "priority" | "not_requirement" | "restore";

export interface FitCorrection {
  id: string;
  requirementId: string;
  action: FitCorrectionAction;
  /** For "priority": the new priority. */
  priority: FitPriority | null;
  createdAt: string;
}

export function isFitPriority(value: unknown): value is FitPriority {
  return FIT_PRIORITIES.includes(value as FitPriority);
}
