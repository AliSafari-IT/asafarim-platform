import { createHash } from "node:crypto";
import { coverLetterSuggestionSchema, type CoverLetterSuggestion } from "../schema";
import type { CoverLetterProvider, CoverLetterProviderCall, CoverLetterProviderOutput } from "../provider";

/**
 * Deterministic, offline cover-letter provider — mirrors
 * `../../providers/fixture.ts`'s approach: zero cost, no network,
 * byte-identical output for identical input. Builds its paragraphs only
 * from sentence-shaped chunks already present in `profileText`, so it
 * never invents wording — the same no-fabrication contract a real
 * provider must satisfy, verified deterministically here.
 */
export class CoverLetterFixtureProvider implements CoverLetterProvider {
  readonly name = "fixture";

  async generate(call: CoverLetterProviderCall): Promise<CoverLetterProviderOutput> {
    const jobTokens = new Set(tokenize(call.jobText));
    const profileSentences = call.profileText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const relevant = profileSentences.filter((s) => tokenize(s).some((t) => jobTokens.has(t)));
    const body = (relevant.length > 0 ? relevant : profileSentences).slice(0, 3);

    const paragraphs = [
      "I am writing to apply for this role, which I believe fits my background well.",
      ...(body.length > 0 ? [body.join(" ")] : []),
      "I would welcome the chance to discuss how I can contribute to your team.",
    ];

    const suggestion: CoverLetterSuggestion = coverLetterSuggestionSchema.parse({
      greeting: "Dear Hiring Manager,",
      paragraphs,
      signOff: "Sincerely,",
    });

    const seedText = `${call.promptVersion}::${call.profileText}::${call.jobText}`;
    const seed = createHash("sha256").update(seedText).digest("hex");

    return {
      suggestion,
      inputTokens: Math.ceil((call.profileText.length + call.jobText.length) / 4),
      outputTokens: Math.ceil(JSON.stringify(suggestion).length / 4),
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
