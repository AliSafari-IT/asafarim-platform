import type { JobMatchAiProvider } from "../../env";
import type { EvaluationProvider } from "./evaluateProvider";

/**
 * Model / prompt registry (JM-047).
 *
 * `promptVersion` and `evaluationModelVersion` already flow through
 * `MatchResult` (lib/matching/contract.ts) -- this is what makes them
 * selectable and auditable rather than hard-coded at the call site, mirroring
 * how `embeddingModelVersion` is a named constant per provider in
 * lib/matching/ai/embeddings.ts (`FIXTURE_EMBEDDING_DIMENSIONS` /
 * `fixtureEmbeddingProvider.modelVersion`).
 *
 * Nothing in this file calls a model. JM-043 (the actual LLM evaluation step)
 * does not exist yet -- these are the versioned constants it will read once
 * it does, so the cache key and the ledger row it writes are consistent with
 * whatever this registry says "current" is at call time.
 */

/** Current prompt version for the evaluation step (JM-043). Bump this
 *  string whenever lib/matching/ai/prompts.ts's evaluation prompt wording
 *  changes in a way that should invalidate the MatchRun cache -- the cache
 *  key includes it. Single source of truth: prompts.ts's
 *  `renderEvaluatePrompt` reads this constant rather than hard-coding its
 *  own copy, so the registry and the rendered prompt can never drift. */
export const EVALUATION_PROMPT_VERSION = "match_evaluate@1";

/** Per-provider evaluation model version, named the same way
 *  `fixtureEmbeddingProvider.modelVersion` is for embeddings: a stable
 *  string a MatchRun/MatchResult can carry as provenance. `fixture` is the
 *  only one ever exercised in CI/tests, like the rest of the AI boundary. */
export const EVALUATION_MODEL_VERSIONS: Record<JobMatchAiProvider, string> = {
  fixture: "fixture-eval-1",
  openai: "openai-eval-unconfigured",
  anthropic: "anthropic-eval-unconfigured",
};

/** Resolve the evaluation model version for a given provider. */
export function evaluationModelVersionFor(provider: JobMatchAiProvider): string {
  return EVALUATION_MODEL_VERSIONS[provider];
}

/**
 * Model cascade: try a cheap model first, escalate to a stronger one only
 * when its own confidence is low. Off by default -- JM-043's evaluation call
 * does not exist yet, so this is config/type scaffolding only. Once it
 * exists, it should read `DEFAULT_MODEL_CASCADE` (or a future per-workspace
 * override, if one is ever added) before its first provider call: run
 * `cheapModel`, and if the resulting `MatchResult.confidence` is below
 * `escalateBelowConfidence`, re-run once with `escalateModel` and keep
 * whichever result has higher confidence.
 */
export interface ModelCascadeConfig {
  enabled: boolean;
  cheapModel: string;
  escalateModel: string;
  /** Escalate when the cheap model's `MatchResult.confidence` is strictly
   *  below this threshold (0-1). */
  escalateBelowConfidence: number;
}

/** Off by default, per the issue ("off by default"). Values are placeholders
 *  for JM-043 to point at real provider model names once it exists. */
export const DEFAULT_MODEL_CASCADE: ModelCascadeConfig = {
  enabled: false,
  cheapModel: EVALUATION_MODEL_VERSIONS.fixture,
  escalateModel: EVALUATION_MODEL_VERSIONS.fixture,
  escalateBelowConfidence: 0.4,
};

const evaluationProviderCache = new Map<string, EvaluationProvider>();

/**
 * Resolve an evaluation provider by name (JM-043). Mirrors
 * lib/matching/ai/embeddings.ts's `getEmbeddingProvider` lazy-import
 * pattern: `fixture` is constructed eagerly (no SDK, no network), while
 * `openai`/`anthropic` are loaded from ./providers/evalOpenai.ts /
 * ./providers/evalAnthropic.ts only when actually selected, so importing
 * this module never pulls in a provider SDK.
 */
export async function getEvaluationProvider(name: JobMatchAiProvider): Promise<EvaluationProvider> {
  const cached = evaluationProviderCache.get(name);
  if (cached) return cached;

  let provider: EvaluationProvider;
  switch (name) {
    case "fixture": {
      const { EvaluationFixtureProvider } = await import("./providers/evalFixture");
      provider = new EvaluationFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiEvaluationProvider } = await import("./providers/evalOpenai");
      provider = new OpenAiEvaluationProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicEvaluationProvider } = await import("./providers/evalAnthropic");
      provider = new AnthropicEvaluationProvider();
      break;
    }
    default:
      throw new Error(`unknown JobMatch evaluation provider: ${name as string}`);
  }
  evaluationProviderCache.set(name, provider);
  return provider;
}
