import { categorizeSkill } from "../../../skillCategories";
import type {
  CategorizeSkillsProvider,
  CategorizeSkillsProviderCall,
  CategorizeSkillsProviderOutput,
} from "../provider";

/**
 * Deterministic, offline categorize provider — mirrors the role of
 * lib/profile/ai/providers/fixture.ts and lib/tailoring/ai/providers/fixture.ts:
 * zero cost, no network, the only provider CI or the test suite ever
 * exercises.
 *
 * Unlike the rewrite fixture (which cannot honestly invent wording, so it
 * returns the input unchanged), categorization already has a deterministic
 * fallback worth using: lib/profile/skillCategories.ts's keyword table.
 * This is the same "guess" a candidate already sees for free in the
 * profile editor's grouped preview — running it through this call gives a
 * consistent "Suggest categories" experience even with no real provider
 * configured, at the cost of the caller (lib/profile/ai/categorize/degraded.ts)
 * still marking the result `degraded: true`: it is honest to call this a
 * fallback, not an AI suggestion, since it cannot generalize past that
 * keyword table's software/IT-shaped taxonomy the way a real model can.
 */
export class CategorizeSkillsFixtureProvider implements CategorizeSkillsProvider {
  readonly name = "fixture";

  async categorize(call: CategorizeSkillsProviderCall): Promise<CategorizeSkillsProviderOutput> {
    const suggestions = call.skillNames.map((name) => ({ name, category: categorizeSkill(name) }));
    const tokens = Math.ceil(call.skillNames.join(" ").length / 4);
    return { suggestions, inputTokens: tokens, outputTokens: tokens, costUsd: 0 };
  }
}
