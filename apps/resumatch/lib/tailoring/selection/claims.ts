import { ungroundedProseTokenCount } from "../../extraction/ai/grounding";
import { claimEvidence, splitSentences, unbackedClaims } from "../ai/coverLetter/claims";
import type { TailorSuggestions } from "../ai/schema";
import type { OutputLanguage } from "../language";
import { termStems, type JobRequirement } from "./requirements";
import type { RequirementCoverage, SelectedSource } from "./select";

/**
 * Source references and the claim check for CV suggestions (#930).
 *
 * The model cites, for the headline, the summary and every bullet, the
 * source ids it drew on. This module checks every claim against those
 * citations, in code:
 *
 * - **Valid references.** An id must be one the prompt actually had. A
 *   bullet of role i must cite role i (`exp:i`) or confirmed evidence linked
 *   to role i; citing another role, or evidence with no single role, is the
 *   misalignment #929 forbids.
 * - **References are not proof.** A valid id says where a claim should come
 *   from, not that it follows. So the claim's numbers and names must appear
 *   in the cited text (the grounding bar the letter uses), its high-risk
 *   claims (mentoring, leading, certifications, spoken languages…) need
 *   backing there, and it may not mention a job requirement the cited text
 *   does not, nor one the candidate does not meet.
 * - **Flag, don't rewrite.** A claim that fails is flagged with the reasons.
 *   The review shows the flag and starts a flagged bullet unticked; nothing
 *   is reworded or added here. The merge (schema.ts) still copies every
 *   structural fact from the profile whatever this says.
 *
 * Lexical on purpose: a reliable "no basis at all" check, not a judge of
 * meaning. A claim that passes can still be wrong, which is why the
 * candidate reviews every one.
 */

export type ClaimFlag =
  | "no_source"
  | "invalid_source"
  | "other_role"
  | "not_in_sources"
  | "unbacked_claim"
  | "unsupported_requirement"
  | "unmet_requirement";

export interface ClaimFinding {
  field: "headline" | "summary" | "bullet";
  experienceIndex: number | null;
  bulletIndex: number | null;
  /** The valid ids it cites, in the model's order. */
  sourceIds: string[];
  flags: ClaimFlag[];
}

export interface ClaimCheck {
  claims: ClaimFinding[];
  flagged: number;
}

/** Ids a role-free claim (headline, summary) may lean on whatever it cites. */
const GENERAL_SOURCES = new Set(["headline", "summary", "skills", "languages", "certs", "work_auth"]);

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function textOf(ids: string[], byId: Map<string, SelectedSource>): string {
  return ids.map((id) => byId.get(id)?.text ?? "").join("\n");
}

function requirementFlags(claim: string, sourceText: string, requirements: JobRequirement[], coverage: RequirementCoverage[]): ClaimFlag[] {
  const claimStems = termStems(claim);
  const sourceStems = termStems(sourceText);
  const flags: ClaimFlag[] = [];
  for (const requirement of requirements) {
    const status = coverage.find((c) => c.id === requirement.id)?.status ?? "unknown";
    const mentioned = requirement.terms.filter((t) => claimStems.has(t));
    if (mentioned.length === 0) continue;
    if ((status === "unmet" || status === "conflict") && mentioned.some((t) => !sourceStems.has(t))) flags.push("unmet_requirement");
    else if (status !== "supported" && mentioned.some((t) => !sourceStems.has(t))) flags.push("unsupported_requirement");
  }
  return flags;
}

function contentFlags(
  claim: string,
  sourceText: string,
  mode: "prose" | "headline",
  requirements: JobRequirement[],
  coverage: RequirementCoverage[],
): ClaimFlag[] {
  const flags: ClaimFlag[] = [];
  const lower = sourceText.toLowerCase();
  if (ungroundedProseTokenCount(claim, lower, mode) > 0) flags.push("not_in_sources");
  const evidence = claimEvidence(sourceText);
  if (splitSentences(claim).some((sentence) => unbackedClaims(sentence, evidence).length > 0)) flags.push("unbacked_claim");
  flags.push(...requirementFlags(claim, sourceText, requirements, coverage));
  return flags;
}

export interface ClaimCheckInput {
  suggestions: TailorSuggestions;
  sources: SelectedSource[];
  requirements: JobRequirement[];
  coverage: RequirementCoverage[];
  outputLanguage: OutputLanguage | null;
}

export function checkClaims({ suggestions, sources, requirements, coverage, outputLanguage }: ClaimCheckInput): ClaimCheck {
  const byId = new Map(sources.map((s) => [s.id, s]));
  // German capitalises every noun, so capitals say nothing there: check
  // numbers and technology-shaped names only, as the letter check does.
  const proseMode = outputLanguage === "de" ? "headline" : "prose";
  const allText = sources.map((s) => s.text).join("\n");
  const cited = suggestions.sources ?? { headline: [], summary: [], experienceBullets: [] };
  const claims: ClaimFinding[] = [];

  const general = (field: "headline" | "summary", text: string | null, refs: string[]) => {
    if (!text) return;
    const valid = uniq(refs.filter((id) => byId.has(id)));
    const flags: ClaimFlag[] = refs.some((id) => !byId.has(id)) ? ["invalid_source"] : [];
    // Role-free prose may draw on the whole profile; references point the
    // candidate to the main source but do not narrow the check.
    flags.push(...contentFlags(text, allText, field === "headline" ? "headline" : proseMode, requirements, coverage));
    claims.push({ field, experienceIndex: null, bulletIndex: null, sourceIds: valid, flags: uniq(flags) });
  };
  general("headline", suggestions.headline, cited.headline);
  general("summary", suggestions.summary, cited.summary);

  suggestions.experienceBullets.forEach((bullets, experienceIndex) => {
    bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.trim()) return;
      const refs = cited.experienceBullets[experienceIndex]?.[bulletIndex] ?? [];
      const flags: ClaimFlag[] = [];
      const valid: string[] = [];
      for (const id of uniq(refs)) {
        const source = byId.get(id);
        if (!source) {
          flags.push("invalid_source");
          continue;
        }
        if (source.roleIndex === experienceIndex || GENERAL_SOURCES.has(id)) valid.push(id);
        else flags.push("other_role");
      }
      const roleSources = valid.filter((id) => byId.get(id)!.roleIndex === experienceIndex);
      if (roleSources.length === 0) {
        flags.push("no_source");
      } else {
        flags.push(...contentFlags(bullet, textOf(valid, byId), proseMode, requirements, coverage));
      }
      claims.push({ field: "bullet", experienceIndex, bulletIndex, sourceIds: valid, flags: uniq(flags) });
    });
  });

  return { claims, flagged: claims.filter((c) => c.flags.length > 0).length };
}
