import type { ResuMatchAiProvider } from "../../env";
import type { ExtractionProvider } from "./provider";

/**
 * Model / prompt registry for the AI CV-extraction call. Mirrors
 * lib/tailoring/ai/registry.ts's shape exactly: named constants here
 * rather than hard-coded at the call site, so a persisted document's
 * extractorVersion can never drift from the prompt/model that actually
 * produced it.
 */

export { EXTRACT_PROMPT_VERSION } from "./prompts";

/** `openai` names a real, working model now that
 *  lib/extraction/ai/providers/openai.ts is implemented (#417). `anthropic`
 *  stays the unconfigured placeholder until its adapter exists. */
export const EXTRACT_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-extract-1",
  openai: "gpt-4o-mini",
  anthropic: "anthropic-extract-unconfigured",
};

export function extractModelVersionFor(provider: ResuMatchAiProvider): string {
  return EXTRACT_MODEL_VERSIONS[provider];
}

const extractionProviderCache = new Map<string, ExtractionProvider>();

/**
 * Resolve an extraction provider by name. `fixture` delegates to the
 * deterministic extractor (no SDK, no network); `openai`/`anthropic` are
 * loaded only when actually selected, so importing this module never pulls
 * in a provider SDK.
 */
export async function getExtractionProvider(name: ResuMatchAiProvider): Promise<ExtractionProvider> {
  const cached = extractionProviderCache.get(name);
  if (cached) return cached;

  let provider: ExtractionProvider;
  switch (name) {
    case "fixture": {
      const { ExtractionFixtureProvider } = await import("./providers/fixture");
      provider = new ExtractionFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiExtractionProvider } = await import("./providers/openai");
      provider = new OpenAiExtractionProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicExtractionProvider } = await import("./providers/anthropic");
      provider = new AnthropicExtractionProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch extraction provider: ${name as string}`);
  }
  extractionProviderCache.set(name, provider);
  return provider;
}
