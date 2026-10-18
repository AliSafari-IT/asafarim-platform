import type { ResuMatchAiProvider } from "../../../env";
import type { CoverLetterProvider } from "./provider";
import { createProviderRegistry } from "../../../ai/providerRegistry";

/** Model / prompt registry for the cover-letter call. Mirrors
 *  `../registry.ts` exactly, one call kind over. */

/** Bumped to @2 for issue #455's tone/length controls — the system prompt
 *  is now built per tone/length pair rather than a fixed string. @3: the
 *  optional OUTPUT LANGUAGE rule (#642). */
export const COVER_LETTER_PROMPT_VERSION = "cover_letter@3";

export const COVER_LETTER_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-cover-letter-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
};

export function coverLetterModelVersionFor(provider: ResuMatchAiProvider): string {
  return COVER_LETTER_MODEL_VERSIONS[provider];
}

export const getCoverLetterProvider = createProviderRegistry<CoverLetterProvider>({
  label: "cover-letter",
  loaders: {
    fixture: async () => {
      const { CoverLetterFixtureProvider } = await import("./providers/fixture");
      return new CoverLetterFixtureProvider();
    },
    openai: async () => {
      const { OpenAiCoverLetterProvider } = await import("./providers/openai");
      return new OpenAiCoverLetterProvider();
    },
    anthropic: async () => {
      const { AnthropicCoverLetterProvider } = await import("./providers/anthropic");
      return new AnthropicCoverLetterProvider();
    },
  },
});
