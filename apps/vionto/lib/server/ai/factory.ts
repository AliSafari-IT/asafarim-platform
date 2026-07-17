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

export function getGenerativeVideoProvider(provider: AiProviderId): GenerativeVideoProvider {
  switch (provider) {
    case "kling":
      return KlingVideoProvider;
    // "fal" adapter arrives in Phase G.
    default:
      throw new Error(`No GenerativeVideoProvider adapter for provider "${provider}".`);
  }
}
