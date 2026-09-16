import { createHash } from "node:crypto";
import type { z } from "zod";
import type { MatchEvidence, MatchResult, recommendedActionSchema } from "../../contract";
import { matchResultSchema } from "../../contract";
import { EVALUATION_MODEL_VERSIONS } from "../registry";
import type { EvaluateProviderCall, EvaluateProviderOutput, EvaluationProvider } from "../evaluateProvider";

type RecommendedAction = z.infer<typeof recommendedActionSchema>;

/**
 * Deterministic, offline evaluation provider (JM-043) — evaluation-side
 * fixture, separate from lib/matching/ai/embeddings.ts's embedding fixture
 * and from apps/tasks-ai/lib/ai/providers/fixture.ts's proposal fixture.
 *
 * Same posture as both of those: zero cost, no network, byte-identical
 * output for identical input, and the ONLY provider CI or the test suite
 * ever exercises for evaluation.
 *
 * **Scoring approach — token overlap.** The profile text (already
 * `buildEmbeddingInput` output — see evaluate.ts, this function never sees
 * anything else) and the fenced posting text are each tokenized into
 * lowercased, alphanumeric-only "significant words" (length >= 3, common
 * stopwords removed). The suitability score is the Jaccard-style overlap:
 * `|profileTokens ∩ postingTokens| / |postingTokens|` — i.e. what fraction
 * of the posting's distinct significant words also appear in the profile
 * text. This is deliberately asymmetric (posting-denominated, not a
 * symmetric Jaccard index): "does the profile cover what the posting
 * asks for" is the question a match score should answer, not "how similar
 * are these two bags of words in aggregate," which would reward a long
 * posting with mostly-irrelevant profile overlap the same as full coverage.
 * The result is naturally bounded to [0, 1] and reproducible.
 *
 * `confidence` is derived from how much there was to evaluate at all: a
 * posting with very few significant tokens gives the fixture little to
 * judge, so confidence scales with `postingTokens.length` up to a cap
 * rather than always reporting the same fixed confidence regardless of
 * input size.
 *
 * `matchingSkills` / `missingSkills` are the intersection / posting-minus-
 * profile of the two token sets (capped), and every `MatchEvidence` entry
 * cites a specific overlapping token pair rather than a free paragraph, so
 * the fixture's explanation is honestly traceable exactly like a real
 * provider's is required to be by the contract.
 */
export class EvaluationFixtureProvider implements EvaluationProvider {
  readonly name = "fixture";

  async generate(call: EvaluateProviderCall): Promise<EvaluateProviderOutput> {
    const profileTokens = tokenize(call.profileText);
    const postingTokens = tokenize(call.postingText);

    const profileSet = new Set(profileTokens);
    const postingSet = new Set(postingTokens);

    const overlap = [...postingSet].filter((t) => profileSet.has(t));
    const missing = [...postingSet].filter((t) => !profileSet.has(t));

    const suitabilityScore = postingSet.size === 0 ? 0.5 : clamp01(overlap.length / postingSet.size);
    // Confidence scales with how much signal the posting offered, capped at
    // a modest ceiling — a fixture score is never presented as highly
    // confident regardless of overlap, only as "had enough to judge".
    const confidence = clamp01(Math.min(postingSet.size, 20) / 20) * 0.8;

    const matchingSkills = overlap.slice(0, 20);
    const missingSkills = missing.slice(0, 20);

    const explanation: MatchEvidence[] = overlap.slice(0, 10).map((token, index) => ({
      profileField: `embeddingInput.text[token:${index}]`,
      postingRequirement: token,
      note: `Posting term "${token}" also appears in the candidate's embedding-input text.`,
    }));

    const recommendedAction: RecommendedAction =
      suitabilityScore >= 0.7
        ? "strong_match"
        : suitabilityScore >= 0.5
          ? "worth_applying"
          : suitabilityScore >= 0.3
            ? "consider_with_caveats"
            : "likely_not_a_fit";

    const draft: MatchResult = matchResultSchema.parse({
      suitabilityScore,
      confidence,
      matchingSkills,
      missingSkills,
      uncertainRequirements: [],
      explanation: explanation.length
        ? explanation
        : [
            {
              profileField: "embeddingInput.text",
              postingRequirement: "(no overlapping terms found)",
              note: "No significant token overlap between the profile embedding input and the posting text.",
            },
          ],
      recommendedAction,
      embeddingModelVersion: null,
      evaluationModelVersion: EVALUATION_MODEL_VERSIONS.fixture,
      promptVersion: call.promptVersion,
      degraded: false,
    });

    const seedText = `${call.promptVersion}::${call.profileText}::${call.postingText}`;
    const seed = createHash("sha256").update(seedText).digest("hex");

    return {
      result: draft,
      inputTokens: Math.ceil((call.profileText.length + call.postingText.length) / 4),
      outputTokens: Math.ceil(JSON.stringify(draft).length / 4),
      costUsd: 0,
      ...(process.env.JOBMATCH_FIXTURE_DEBUG ? { seed } : {}),
    };
  }
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "from", "this", "that",
  "will", "have", "has", "our", "who", "can", "not", "all", "but", "into",
  "using", "use", "per", "than", "then", "role", "job", "work", "years",
  "year", "team", "about", "such", "also", "what", "when", "over", "out",
  "ability", "experience", "strong", "good", "least",
]);

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
