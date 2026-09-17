import { createHash } from "node:crypto";
import { tailorSuggestionsSchema, type TailorSuggestions } from "../schema";
import type { TailorProvider, TailorProviderCall, TailorProviderOutput } from "../provider";

/**
 * Deterministic, offline tailoring provider — mirrors the old matching
 * product's `EvaluationFixtureProvider`
 * (lib/matching/ai/providers/evalFixture.ts, deleted with the pivot): zero
 * cost, no network, byte-identical output for identical input, and the only
 * provider CI or the test suite ever exercises.
 *
 * **Approach.** The job's significant words (tokenized the same way the
 * old evaluation fixture did) decide which of the profile's own skills to
 * put first and which existing experience-summary sentences to keep as
 * bullets — this fixture never invents wording, it only reorders/selects
 * from what `experienceSummaries`/`profileSkillNames` already contain, so
 * it satisfies the same no-fabrication contract a real provider must.
 */
export class TailorFixtureProvider implements TailorProvider {
  readonly name = "fixture";

  async generate(call: TailorProviderCall): Promise<TailorProviderOutput> {
    const jobTokens = new Set(tokenize(call.jobText));

    const skillsOrder = [...call.profileSkillNames].sort((a, b) => {
      const aHit = tokenize(a).some((t) => jobTokens.has(t)) ? 0 : 1;
      const bHit = tokenize(b).some((t) => jobTokens.has(t)) ? 0 : 1;
      return aHit - bHit;
    });

    const experienceBullets = call.experienceSummaries.map((summary) => {
      if (!summary) return [];
      // Split into sentence-shaped chunks and keep them in their original
      // order — a fixture reorders/selects, it never rewrites wording.
      const sentences = summary
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return sentences.slice(0, 8);
    });

    const headline = jobTokens.size > 0 ? call.profileSkillNames.slice(0, 3).join(" · ") || null : null;

    const suggestions: TailorSuggestions = tailorSuggestionsSchema.parse({
      headline,
      summary: null,
      skillsOrder,
      experienceBullets,
    });

    const seedText = `${call.promptVersion}::${call.profileText}::${call.jobText}`;
    const seed = createHash("sha256").update(seedText).digest("hex");

    return {
      suggestions,
      inputTokens: Math.ceil((call.profileText.length + call.jobText.length) / 4),
      outputTokens: Math.ceil(JSON.stringify(suggestions).length / 4),
      costUsd: 0,
      ...(process.env.RESUMATCH_FIXTURE_DEBUG ? { seed } : {}),
    };
  }
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3),
    ),
  );
}
