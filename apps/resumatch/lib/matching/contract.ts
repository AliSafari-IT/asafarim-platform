import { z } from "zod";

/**
 * The matching feature contract (JM-039).
 *
 * This is what every later M5 piece — embedding generation, ranking,
 * structured LLM evaluation, evidence UI — is built to produce and consume.
 * Defining it before any of them exist means the model boundary is a schema
 * decision made once, not an accumulation of whatever a particular provider
 * response happened to look like.
 *
 * Three rules shape it, all carried over from M4's own hard-won law:
 *
 * **A score is never presented as certainty.** `confidence` travels with
 * every `suitabilityScore`, and `uncertainRequirements` names what the model
 * could not evaluate rather than silently scoring around it. Nothing here
 * claims to predict a hiring outcome — `recommendedAction` is a suggestion
 * for the candidate's own next step, not a verdict on the job.
 *
 * **Every claim is evidence-linked.** `explanation` is not a free paragraph;
 * it is a list of `MatchEvidence` entries, each pointing at the specific CV
 * fact and job requirement that produced it, so a candidate — or an
 * auditor — can trace a score back to what actually supported it, per
 * JM-048.
 *
 * **Model provenance is part of the result, not metadata bolted on after.**
 * `modelVersion` and `promptVersion` travel with the score for the same
 * reason `rulesVersion` travels with an M4 eligibility result: reproducing a
 * decision later requires knowing exactly what produced it the first time.
 */

export const MATCHING_CONTRACT_VERSION = "1.0.0";

/** 0-1. What the model is willing to say about how well the candidate fits. */
const scoreValue = z.number().min(0).max(1);

export const matchEvidenceSchema = z.object({
  /** The CV fact this evidence draws on — never a raw excerpt, always a
   *  reference into the confirmed profile (e.g. "skills[2].name",
   *  "experience[0].summary") so evidence cannot smuggle PII the profile
   *  contract already excluded back in through a quoted sentence. */
  profileField: z.string().trim().min(1).max(120),
  /** The posting requirement this evidence responds to, in the model's own
   *  words — this side may legitimately quote the posting, since the
   *  posting is not candidate data. */
  postingRequirement: z.string().trim().min(1).max(400),
  /** Plain-language statement of how the two relate. Never a raw model
   *  monologue — schema-validated like everything else in this contract. */
  note: z.string().trim().min(1).max(400),
});

export type MatchEvidence = z.infer<typeof matchEvidenceSchema>;

export const recommendedActionSchema = z.enum([
  "strong_match",
  "worth_applying",
  "consider_with_caveats",
  "likely_not_a_fit",
]);

export const matchResultSchema = z
  .object({
    contractVersion: z.literal(MATCHING_CONTRACT_VERSION).default(MATCHING_CONTRACT_VERSION),

    /** How well the candidate's stated facts align with the posting's
     *  stated requirements. Not a hiring-probability estimate — see the
     *  module doc comment. */
    suitabilityScore: scoreValue,
    /** How confident the model is in `suitabilityScore` itself, given how
     *  much evaluable evidence was available. A model that ran on a sparse
     *  profile against a vague posting should report low confidence rather
     *  than a score dressed up as certain. */
    confidence: scoreValue,

    /** Skills or requirements the model found support for, referencing the
     *  profile field that supplied it. */
    matchingSkills: z.array(trimmed(120)).max(50).default([]),
    /** Requirements the posting states that the profile gives no support
     *  for — a gap, not an accusation. */
    missingSkills: z.array(trimmed(120)).max(50).default([]),
    /** Requirements the model could not evaluate either way — the posting
     *  was ambiguous, or the profile was silent in a way that is genuinely
     *  unknown rather than a stated absence. This list is what keeps
     *  "uncertain" from being quietly folded into either match or gap. */
    uncertainRequirements: z.array(trimmed(400)).max(30).default([]),

    /** Evidence-linked explanation — see MatchEvidence. Empty only when
     *  degraded mode (JM-047) produced no model output to explain. */
    explanation: z.array(matchEvidenceSchema).max(20).default([]),

    recommendedAction: recommendedActionSchema,

    /** Provenance, so a result is reproducible and auditable later. */
    embeddingModelVersion: trimmed(80).nullable().default(null),
    evaluationModelVersion: trimmed(80).nullable().default(null),
    promptVersion: trimmed(40),

    /** True when this result was produced without a live model call — see
     *  buildDegradedMatchResult. The UI must say so plainly rather than let
     *  a placeholder score be mistaken for a real evaluation. */
    degraded: z.boolean().default(false),
  })
  .strict()
  .superRefine((result, ctx) => {
    // The two shapes are mutually exclusive by construction, not just by
    // convention: a schema that allowed a "degraded" result to also carry
    // real evidence and provenance would let a caller persist a value that
    // claims no model ran while still looking like one did, and a
    // "real" result with no evidence is a model call nobody can audit.
    if (result.degraded) {
      if (
        result.confidence !== 0 ||
        result.explanation.length > 0 ||
        result.embeddingModelVersion !== null ||
        result.evaluationModelVersion !== null
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "A degraded result must carry zero confidence, no evidence, and no model provenance — see buildDegradedMatchResult.",
          path: ["degraded"],
        });
      }
    } else if (result.explanation.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "A non-degraded result must carry at least one evidence entry explaining its score.",
        path: ["explanation"],
      });
    }
  });

export type MatchResult = z.infer<typeof matchResultSchema>;

function trimmed(max: number) {
  return z.string().trim().min(1).max(max);
}

/** Parse untrusted matching output — a provider response or a stored row. */
export function parseMatchResult(input: unknown): MatchResult {
  return matchResultSchema.parse(input);
}

/**
 * The result JobMatch returns when no model call happened at all — no
 * provider configured, budget exhausted, or the provider call failed after
 * retries (JM-047's "honest degraded mode"). Never a fabricated score: an
 * absent evaluation is represented as `degraded: true` with a neutral,
 * unscored shape, not as a score of 0 (which would read as "not a fit"
 * rather than "not evaluated").
 */
export function buildDegradedMatchResult(promptVersion: string): MatchResult {
  return matchResultSchema.parse({
    suitabilityScore: 0.5,
    confidence: 0,
    recommendedAction: "consider_with_caveats",
    promptVersion,
    degraded: true,
  });
}
