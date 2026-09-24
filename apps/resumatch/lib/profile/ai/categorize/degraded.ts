import { logError } from "../../../observability/logger";
import { getEnv, type ResuMatchAiProvider } from "../../../env";
import { assertCanRunProviderCall, recordBilledFailure, recordUsage, QuotaExceededError } from "../../../tailoring/ai/quota";
import type { CostAttribution } from "../../../costs/ledger";
import { renderCategorizePrompt } from "./prompts";
import { CategorizeSkillsProviderError } from "./provider";
import { CATEGORIZE_MODEL_VERSIONS, getCategorizeSkillsProvider } from "./registry";
import { mergeSuggestedCategories } from "./schema";

/**
 * Degraded-mode wiring for the skill-categorization call. Mirrors
 * lib/profile/ai/degraded.ts (summary rewrite) and
 * lib/tailoring/ai/degraded.ts almost exactly: budget exhaustion, retries
 * exhausted, or a response that fails schema validation all fall back to
 * this app's own deterministic keyword categorizer
 * (lib/profile/skillCategories.ts, via the fixture provider) rather than a
 * 500 or a blank suggestion.
 */

export interface CategorizeOutcome {
  /** name -> suggested category, already run through mergeSuggestedCategories
   *  so it only ever contains names that exactly match one of the
   *  candidate's own skills. */
  suggestions: Map<string, string>;
  /** True when this came from the deterministic keyword fallback rather
   *  than a real model call — either because RESUMATCH_AI_PROVIDER=fixture
   *  (the default everywhere) or because a real provider call failed. The
   *  caller (the API route) surfaces this so the UI can say the
   *  suggestions are the built-in keyword guess, not an AI read of the
   *  candidate's actual field. */
  degraded: boolean;
}

const MAX_ATTEMPTS = 3;

async function fixtureFallback(
  skillNames: string[],
  prompt: ReturnType<typeof renderCategorizePrompt>,
): Promise<CategorizeOutcome> {
  const provider = await getCategorizeSkillsProvider("fixture");
  const output = await provider.categorize({
    skillNames: prompt.skillNamesUsed,
    system: prompt.system,
    user: prompt.user,
    promptVersion: prompt.version,
    model: CATEGORIZE_MODEL_VERSIONS.fixture,
  });
  return { suggestions: mergeSuggestedCategories(skillNames, output.suggestions), degraded: true };
}

export async function categorizeSkillsWithFallback(
  workspaceId: string,
  skillNames: string[],
  opts: { provider?: ResuMatchAiProvider } = {},
): Promise<CategorizeOutcome> {
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  const prompt = renderCategorizePrompt(skillNames);
  const attribution: CostAttribution = { subjectType: "candidate_profile", subjectId: workspaceId };

  if (aiProvider === "fixture") return fixtureFallback(skillNames, prompt);

  try {
    await assertCanRunProviderCall(workspaceId, "categorize_skills");

    const provider = await getCategorizeSkillsProvider(aiProvider);
    const modelVersion = CATEGORIZE_MODEL_VERSIONS[aiProvider];

    for (let attempt = 1; ; attempt++) {
      try {
        const started = Date.now();
        const output = await provider.categorize({
          skillNames: prompt.skillNamesUsed,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
        });
        await recordUsage({
          workspaceId,
          kind: "categorize_skills",
          provider: aiProvider,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        });
        return { suggestions: mergeSuggestedCategories(skillNames, output.suggestions), degraded: false };
      } catch (err) {
        await recordBilledFailure(err, { workspaceId, kind: "categorize_skills", provider: aiProvider, model: modelVersion, promptVersion: prompt.version, attribution });
        const retryable = err instanceof CategorizeSkillsProviderError ? err.retryable : false;
        logError("profile.categorize.provider_call_failed", err, { workspaceId, attempt, provider: aiProvider });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("profile.categorize.degraded.budget_exhausted", error, { workspaceId, reason: error.reason });
    } else {
      logError("profile.categorize.degraded.provider_call_failed", error, { workspaceId });
    }
    return fixtureFallback(skillNames, prompt);
  }
}
