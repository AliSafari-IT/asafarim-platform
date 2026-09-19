import type { ResuMatchAiProvider } from "../../../env";
import type { CoverLetterProvider } from "./provider";

/** Model / prompt registry for the cover-letter call. Mirrors
 *  `../registry.ts` exactly, one call kind over. */

export const COVER_LETTER_PROMPT_VERSION = "cover_letter@1";

export const COVER_LETTER_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-cover-letter-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
};

export function coverLetterModelVersionFor(provider: ResuMatchAiProvider): string {
  return COVER_LETTER_MODEL_VERSIONS[provider];
}

const coverLetterProviderCache = new Map<string, CoverLetterProvider>();

export async function getCoverLetterProvider(name: ResuMatchAiProvider): Promise<CoverLetterProvider> {
  const cached = coverLetterProviderCache.get(name);
  if (cached) return cached;

  let provider: CoverLetterProvider;
  switch (name) {
    case "fixture": {
      const { CoverLetterFixtureProvider } = await import("./providers/fixture");
      provider = new CoverLetterFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiCoverLetterProvider } = await import("./providers/openai");
      provider = new OpenAiCoverLetterProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicCoverLetterProvider } = await import("./providers/anthropic");
      provider = new AnthropicCoverLetterProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch cover-letter provider: ${name as string}`);
  }
  coverLetterProviderCache.set(name, provider);
  return provider;
}
