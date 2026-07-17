/**
 * Provider factory — resolves a provider id to the adapter that implements a
 * capability. The rest of the app calls these, never the adapter classes
 * directly, so swapping/adding providers stays contained to the registry +
 * adapters + this file.
 */
import {
  OpenAIStoryPlanner,
  AnthropicStoryPlanner,
  OpenAINarrationProvider,
  ElevenLabsNarrationProvider,
  KlingVideoProvider,
  createFalVideoProvider,
} from "./adapters";
import type {
  GenerativeVideoProvider,
  NarrationProvider,
  StoryPlanner,
} from "./interfaces";
import type { AiProviderId } from "./types";

export function getStoryPlanner(provider: AiProviderId): StoryPlanner {
  switch (provider) {
    case "openai":
      return OpenAIStoryPlanner;
    case "anthropic":
      return AnthropicStoryPlanner;
    default:
      throw new Error(`No StoryPlanner adapter for provider "${provider}".`);
  }
}

export function getNarrationProvider(provider: AiProviderId): NarrationProvider {
  switch (provider) {
    case "openai":
      return OpenAINarrationProvider;
    case "elevenlabs":
      return ElevenLabsNarrationProvider;
    default:
      throw new Error(`No NarrationProvider adapter for provider "${provider}".`);
  }
}

/**
 * Resolve a generative-video provider. `fal` is BYOK and requires the resolved
 * key in `ctx.apiKey`; `kling` currently reads its key/secret from env.
 */
export function getGenerativeVideoProvider(
  provider: AiProviderId,
  ctx?: { apiKey?: string; apiSecret?: string }
): GenerativeVideoProvider {
  switch (provider) {
    case "kling":
      return KlingVideoProvider;
    case "fal":
      if (!ctx?.apiKey) throw new Error("fal.ai requires an API key (set FAL_KEY or add your key in settings).");
      return createFalVideoProvider(ctx.apiKey);
    default:
      throw new Error(`No GenerativeVideoProvider adapter for provider "${provider}".`);
  }
}
