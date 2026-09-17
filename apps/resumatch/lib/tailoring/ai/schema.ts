import { z } from "zod";
import type { CandidateProfileContent } from "../../profile/contract";
import { certificationSchema, educationSchema } from "../../profile/contract";

/**
 * The tailored-resume contract.
 *
 * Mirrors `lib/profile/contract.ts`'s discipline: structured JSON only,
 * re-validated before persistence. Two schemas, deliberately kept separate:
 *
 * - `tailorSuggestionsSchema` is the ONLY thing a provider call is allowed
 *   to return — reworded text and a proposed skill order, nothing that
 *   could itself be a fabricated fact.
 * - `tailoredResumeContentSchema` is what actually gets persisted, and
 *   `mergeTailoringSuggestions` below is the ONLY function that produces
 *   one. It builds `title`/`employer`/`startedOn`/`endedOn`/`isCurrent` on
 *   every experience entry, and all of `education`/`certifications`,
 *   directly from the source `CandidateProfileVersion` in code — never from
 *   provider output — so there is no path by which a model response could
 *   introduce a fact that was not already in the candidate's confirmed
 *   profile, independent of whatever the prompt asked for. See
 *   lib/tailoring/ai/prompts.ts's HARD RULES section for the model-facing
 *   half of this guarantee.
 */

export const TAILORED_RESUME_CONTRACT_VERSION = "1.0.0";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/**
 * What a tailoring provider call may return: reworded text and a proposed
 * skill re-ordering, positionally aligned bullet suggestions per experience
 * entry. Every field here is discardable — `mergeTailoringSuggestions`
 * treats this as advisory, never authoritative, over what the persisted
 * content actually contains.
 */
export const tailorSuggestionsSchema = z.object({
  headline: trimmed(200).nullable().default(null),
  summary: z.string().trim().max(2000).nullable().default(null),
  /** Proposed order/subset of the profile's own skill names. Any name not
   *  already present in the source profile is dropped during merge, never
   *  trusted as a new skill. */
  skillsOrder: z.array(trimmed(80)).max(60).default([]),
  /** Bullets per experience entry, positionally aligned to
   *  `profile.experience` by index. An index beyond the profile's own
   *  experience array, or one the provider left out, falls back to that
   *  entry's existing `summary` during merge. */
  experienceBullets: z.array(z.array(z.string().trim().max(400)).max(8)).max(60).default([]),
});

export type TailorSuggestions = z.infer<typeof tailorSuggestionsSchema>;

export function parseTailorSuggestions(input: unknown): TailorSuggestions {
  return tailorSuggestionsSchema.parse(input);
}

const tailoredExperienceSchema = z.object({
  title: trimmed(120),
  employer: trimmed(120).nullable().default(null),
  startedOn: z.string().nullable().default(null),
  endedOn: z.string().nullable().default(null),
  isCurrent: z.boolean().default(false),
  bullets: z.array(z.string().trim().max(400)).max(8).default([]),
});

export const tailoredResumeContentSchema = z
  .object({
    contractVersion: z.literal(TAILORED_RESUME_CONTRACT_VERSION).default(TAILORED_RESUME_CONTRACT_VERSION),

    fullName: trimmed(160).nullable().default(null),
    email: z.string().trim().email().max(320).nullable().default(null),
    phone: trimmed(40).nullable().default(null),

    headline: trimmed(200).nullable().default(null),
    summary: z.string().trim().max(2000).nullable().default(null),

    skills: z.array(trimmed(80)).max(60).default([]),
    experience: z.array(tailoredExperienceSchema).max(60).default([]),

    /** Unchanged from the profile — never rewritten. */
    education: z.array(educationSchema).max(30).default([]),
    /** Unchanged from the profile — never rewritten. */
    certifications: z.array(certificationSchema).max(40).default([]),
  })
  .strict();

export type TailoredResumeContent = z.infer<typeof tailoredResumeContentSchema>;

/** Parse untrusted tailored-resume content — a row read back from the
 *  database. */
export function parseTailoredResumeContent(input: unknown): TailoredResumeContent {
  return tailoredResumeContentSchema.parse(input);
}

const EMPTY_SUGGESTIONS: TailorSuggestions = tailorSuggestionsSchema.parse({});

/**
 * Build the persisted `TailoredResumeContent` from a confirmed profile and
 * (optionally) a provider's suggestions. Called with `suggestions: null` for
 * the degraded/no-provider path — see lib/tailoring/ai/generate.ts — which
 * produces the profile carried over unchanged, with no AI rewriting
 * applied: an honest fallback, never a fabricated tailoring.
 *
 * This is the single point that decides what is AI-authored (headline,
 * summary, bullet wording, skill order) versus what is copied verbatim
 * (every other field) — see the module doc comment above.
 */
export function mergeTailoringSuggestions(
  profile: CandidateProfileContent,
  suggestions: TailorSuggestions | null,
): TailoredResumeContent {
  const s = suggestions ?? EMPTY_SUGGESTIONS;

  // Only skill names that actually exist in the source profile survive —
  // a provider-suggested name with no match is silently dropped, never
  // added. Real skills the provider did not mention are appended at the
  // end, so reordering can never lose a skill the candidate has.
  const realSkillNames = profile.skills.map((skill) => skill.name);
  const realSkillsByKey = new Map(realSkillNames.map((name) => [canonicalizeSkill(name), name]));
  const seen = new Set<string>();
  const orderedSkills: string[] = [];
  for (const proposed of s.skillsOrder) {
    const key = canonicalizeSkill(proposed);
    const real = realSkillsByKey.get(key);
    if (real && !seen.has(key)) {
      orderedSkills.push(real);
      seen.add(key);
    }
  }
  for (const name of realSkillNames) {
    const key = canonicalizeSkill(name);
    if (!seen.has(key)) {
      orderedSkills.push(name);
      seen.add(key);
    }
  }

  const experience = profile.experience.map((entry, index) => {
    const bullets = s.experienceBullets[index]?.length
      ? s.experienceBullets[index]
      : entry.summary
        ? [entry.summary]
        : [];
    return {
      title: entry.title,
      employer: entry.employer,
      startedOn: entry.startedOn,
      endedOn: entry.endedOn,
      isCurrent: entry.isCurrent,
      bullets,
    };
  });

  return tailoredResumeContentSchema.parse({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    headline: s.headline ?? profile.headline,
    summary: s.summary ?? profile.summary,
    skills: orderedSkills,
    experience,
    education: profile.education,
    certifications: profile.certifications,
  });
}

function canonicalizeSkill(name: string): string {
  return name.trim().toLowerCase();
}
