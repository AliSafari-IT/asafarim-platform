import { extractProfileFromText } from "../../profileExtractor";
import type { ExtractionProvider, ExtractionProviderCall, ExtractionProviderOutput } from "../provider";

/**
 * Deterministic, offline extraction provider — mirrors
 * lib/tailoring/ai/providers/fixture.ts's role exactly: zero cost, no
 * network, byte-identical output for identical input, and the only
 * provider CI or the test suite ever exercises.
 *
 * **Approach.** Rather than inventing a second extraction algorithm, this
 * delegates straight to the existing deterministic regex extractor
 * (lib/extraction/profileExtractor.ts) and reshapes its result to the
 * `aiExtractionSchema` field set — dropping `preferences`/
 * `workAuthorization`/`contractVersion`, which that schema does not carry.
 * This keeps `RESUMATCH_AI_PROVIDER=fixture` (the default everywhere
 * except an explicitly configured deployment) behaviourally identical to
 * the pre-AI extraction pipeline: nothing changes for a candidate until a
 * real provider is actually selected.
 */
export class ExtractionFixtureProvider implements ExtractionProvider {
  readonly name = "fixture";

  async extract(call: ExtractionProviderCall): Promise<ExtractionProviderOutput> {
    const { content } = extractProfileFromText(call.text);

    const data = {
      fullName: content.fullName,
      email: content.email,
      phone: content.phone,
      headline: content.headline,
      summary: content.summary,
      baseLocation: content.baseLocation,
      languages: content.languages,
      skills: content.skills,
      experience: content.experience,
      education: content.education,
      certifications: content.certifications,
    };

    return {
      data,
      inputTokens: Math.ceil(call.text.length / 4),
      outputTokens: Math.ceil(JSON.stringify(data).length / 4),
      costUsd: 0,
    };
  }
}
