import { z } from "zod";
import {
  certificationSchema,
  educationSchema,
  emptyProfile,
  experienceSchema,
  languageSchema,
  parseProfileContent,
  skillSchema,
  type CandidateProfileContent,
} from "../../profile/contract";

/**
 * The AI-extraction output contract.
 *
 * Deliberately narrower than `candidateProfileSchema`: it excludes
 * `preferences` and `workAuthorization` entirely — those are the
 * candidate's own stated intent, never something to infer from a CV — and
 * every field is optional/nullable, since a CV may simply not state it.
 *
 * `.strict()` here is the FIRST lock against a model smuggling in an
 * unlisted field (e.g. a protected attribute under a plausible name); the
 * second, structural lock is `mergeAiExtraction` routing everything through
 * `parseProfileContent` (`assertNoProtectedAttributes` + the full
 * `candidateProfileSchema`'s own `.strict()`) regardless of what passed
 * here. A response that fails either parse is a failed extraction call —
 * see lib/extraction/ai/degraded.ts — never partially applied.
 */
export const AI_EXTRACTION_CONTRACT_VERSION = "1.0.0";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const aiExtractionSchema = z
  .object({
    fullName: trimmed(160).nullable().default(null),
    email: z.string().trim().email().max(320).nullable().default(null),
    phone: trimmed(40).nullable().default(null),
    headline: trimmed(200).nullable().default(null),
    summary: z.string().trim().max(4000).nullable().default(null),
    baseLocation: trimmed(120).nullable().default(null),

    languages: z.array(languageSchema).max(20).default([]),
    skills: z.array(skillSchema).max(200).default([]),
    experience: z.array(experienceSchema).max(60).default([]),
    education: z.array(educationSchema).max(30).default([]),
    certifications: z.array(certificationSchema).max(40).default([]),
  })
  .strict();

export type AiExtractionOutput = z.infer<typeof aiExtractionSchema>;

/** Parse a provider's raw JSON response. Throws on anything that does not
 *  match — including an unknown top-level key — which the caller must
 *  treat as a failed call, not attempt to salvage partially. */
export function parseAiExtractionOutput(input: unknown): AiExtractionOutput {
  return aiExtractionSchema.parse(input);
}

/**
 * Build a full, persistable `CandidateProfileContent` from a validated
 * extraction output. The only function that is allowed to do this — every
 * call site must go through here rather than constructing profile content
 * from provider output directly, so `parseProfileContent`'s guarantees
 * apply unconditionally.
 *
 * `preferences` and `workAuthorization` are never touched: they start (and
 * stay, until the candidate sets them) at `emptyProfile()`'s defaults.
 */
export function mergeAiExtraction(output: AiExtractionOutput): CandidateProfileContent {
  return parseProfileContent({
    ...emptyProfile(),
    fullName: output.fullName,
    email: output.email,
    phone: output.phone,
    headline: output.headline,
    summary: output.summary,
    baseLocation: output.baseLocation,
    languages: output.languages,
    skills: output.skills,
    experience: output.experience,
    education: output.education,
    certifications: output.certifications,
  });
}
