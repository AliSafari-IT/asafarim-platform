import type { AiProvider } from "./provider";
import { FixtureProvider } from "./providers/fixture";

/**
 * Provider registry. The real adapters are imported lazily so a CI run (or
 * any run without provider keys) never loads their SDKs. `fixture` is the
 * default and the only one used by tests.
 */
const cache = new Map<string, AiProvider>();

export async function getProvider(name: string): Promise<AiProvider> {
  const cached = cache.get(name);
  if (cached) return cached;

  let provider: AiProvider;
  switch (name) {
    case "fixture":
      provider = new FixtureProvider();
      break;
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic");
      provider = new AnthropicProvider();
      break;
    }
    case "openai": {
      const { OpenAiProvider } = await import("./providers/openai");
      provider = new OpenAiProvider();
      break;
    }
    default:
      throw new Error(`unknown AI provider: ${name}`);
  }
  cache.set(name, provider);
  return provider;
}

export const PROVIDER_NAMES = ["fixture", "anthropic", "openai"] as const;
