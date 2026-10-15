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

/** The env var each real provider's adapter refuses to run without. */
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/** True when `name` is a real provider whose API key is set on this server. */
export function isProviderConfigured(
  name: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = PROVIDER_KEY_ENV[name];
  return key !== undefined && Boolean(env[key]);
}

/**
 * The one real provider to try when `primary` is exhausted on a
 * retryable-class failure (issue #537): the first other real provider in
 * PROVIDER_NAMES whose key is set. `null` when there is none, and always
 * for a `fixture` workspace, which never spends on a real provider.
 */
export function fallbackProviderFor(
  primary: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (primary === "fixture") return null;
  return (
    PROVIDER_NAMES.find((name) => name !== "fixture" && name !== primary && isProviderConfigured(name, env)) ??
    null
  );
}
