import type { ResuMatchAiProvider } from "../../env";
import type { ExtractionProvider } from "./provider";
import { createProviderRegistry } from "../../ai/providerRegistry";

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

/**
 * Resolve an extraction provider by name. `fixture` delegates to the
 * deterministic extractor (no SDK, no network); `openai`/`anthropic` are
 * loaded only when actually selected, so importing this module never pulls
 * in a provider SDK.
 */
export const getExtractionProvider = createProviderRegistry<ExtractionProvider>({
  label: "extraction",
  loaders: {
    fixture: async () => {
      const { ExtractionFixtureProvider } = await import("./providers/fixture");
      return new ExtractionFixtureProvider();
    },
    openai: async () => {
      const { OpenAiExtractionProvider } = await import("./providers/openai");
      return new OpenAiExtractionProvider();
    },
    anthropic: async () => {
      const { AnthropicExtractionProvider } = await import("./providers/anthropic");
      return new AnthropicExtractionProvider();
    },
  },
});
