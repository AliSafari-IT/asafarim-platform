import type { ResuMatchAiProvider } from "../../env";
import type { TailorProvider } from "./provider";

/**
 * Model / prompt registry for the CV-tailoring call. Mirrors the old
 * matching product's `registry.ts` (lib/matching/ai/registry.ts, deleted
 * with the pivot): `promptVersion` and `modelVersion` are named constants
 * here rather than hard-coded at the call site, so the `TailoredResume` row
 * that gets written and the prompt that produced it can never drift.
 */

/** Bump whenever prompts.ts's tailoring prompt wording changes in a way
 *  that should be visible in a TailoredResume's provenance. */
export const TAILOR_PROMPT_VERSION = "tailor_resume@2";

/** Per-provider model version, named the same way the old registry's
 *  `EVALUATION_MODEL_VERSIONS` was: a stable string a TailoredResume can
 *  carry as provenance. `fixture` is the only one ever exercised in
 *  CI/tests. */
export const TAILOR_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-tailor-1",
  openai: "openai-tailor-unconfigured",
  anthropic: "anthropic-tailor-unconfigured",
};

export function tailorModelVersionFor(provider: ResuMatchAiProvider): string {
  return TAILOR_MODEL_VERSIONS[provider];
}

const tailorProviderCache = new Map<string, TailorProvider>();

/**
 * Resolve a tailoring provider by name. `fixture` is constructed eagerly
 * (no SDK, no network); `openai`/`anthropic` are loaded only when actually
 * selected, so importing this module never pulls in a provider SDK.
 */
export async function getTailorProvider(name: ResuMatchAiProvider): Promise<TailorProvider> {
  const cached = tailorProviderCache.get(name);
  if (cached) return cached;

  let provider: TailorProvider;
  switch (name) {
    case "fixture": {
      const { TailorFixtureProvider } = await import("./providers/fixture");
      provider = new TailorFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiTailorProvider } = await import("./providers/openai");
      provider = new OpenAiTailorProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicTailorProvider } = await import("./providers/anthropic");
      provider = new AnthropicTailorProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch tailoring provider: ${name as string}`);
  }
  tailorProviderCache.set(name, provider);
  return provider;
}
