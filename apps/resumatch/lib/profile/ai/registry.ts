import type { ResuMatchAiProvider } from "../../env";
import type { RewriteProvider } from "./provider";

export { REWRITE_PROMPT_VERSION } from "./prompts";

export const REWRITE_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-rewrite-1",
  openai: "gpt-4o-mini",
  anthropic: "anthropic-rewrite-unconfigured",
};

const rewriteProviderCache = new Map<string, RewriteProvider>();

export async function getRewriteProvider(name: ResuMatchAiProvider): Promise<RewriteProvider> {
  const cached = rewriteProviderCache.get(name);
  if (cached) return cached;

  let provider: RewriteProvider;
  switch (name) {
    case "fixture": {
      const { RewriteFixtureProvider } = await import("./providers/fixture");
      provider = new RewriteFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiRewriteProvider } = await import("./providers/openai");
      provider = new OpenAiRewriteProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicRewriteProvider } = await import("./providers/anthropic");
      provider = new AnthropicRewriteProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch rewrite provider: ${name as string}`);
  }
  rewriteProviderCache.set(name, provider);
  return provider;
}
