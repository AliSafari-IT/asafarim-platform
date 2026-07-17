/**
 * Provider & model registry — the single source of truth for which providers
 * exist, what they can do, their env key names, and (for paid media) rough
 * cost. Feeds provider routing, the BYOK settings UI, and cost estimation.
 *
 * Adding a provider = add an entry here + an adapter. Nothing else in the app
 * hardcodes provider knowledge.
 */
import type { AiCapability, AiProviderId, AuthKind, ProviderTier } from "./types";

export interface ModelEntry {
  /** Model id sent to the provider (or our internal id for local renderers). */
  id: string;
  label: string;
  capability: AiCapability;
  tier: ProviderTier;
  /** Rough USD cost per unit, for estimates/UI. Unit depends on capability. */
  approxCost?: { amount: number; unit: "per_5s_clip" | "per_1k_tokens" | "per_1k_chars" | "per_image" };
}

export interface ProviderEntry {
  id: AiProviderId;
  label: string;
  capabilities: AiCapability[];
  auth: AuthKind;
  /** Env var name(s) used as the server-side fallback key. */
  envKey?: string;
  envSecret?: string;
  /** Whether users may supply their own key (BYOK) for this provider. */
  byok: boolean;
  /** Whether an adapter is implemented yet (false = registered, coming soon). */
  implemented: boolean;
  models: ModelEntry[];
}

export const PROVIDER_REGISTRY: readonly ProviderEntry[] = [
  {
    id: "openai",
    label: "OpenAI",
    capabilities: ["album_analysis", "story", "narration"],
    auth: "api_key",
    envKey: "OPENAI_API_KEY",
    byok: true,
    implemented: true,
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capability: "story", tier: "standard" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (vision)", capability: "album_analysis", tier: "standard" },
      { id: "tts-1-hd", label: "OpenAI TTS HD", capability: "narration", tier: "standard" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    capabilities: ["album_analysis", "story"],
    auth: "api_key",
    envKey: "ANTHROPIC_API_KEY",
    byok: true,
    implemented: true,
    models: [
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", capability: "story", tier: "economy" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", capability: "story", tier: "premium" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    capabilities: ["album_analysis", "story"],
    auth: "api_key",
    envKey: "GEMINI_API_KEY",
    byok: true,
    implemented: false,
    models: [
      { id: "gemini-flash", label: "Gemini Flash", capability: "album_analysis", tier: "economy" },
    ],
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    capabilities: ["narration"],
    auth: "api_key",
    envKey: "ELEVENLABS_API_KEY",
    byok: true,
    implemented: true,
    models: [
      { id: "eleven_flash_v2_5", label: "ElevenLabs Flash", capability: "narration", tier: "standard" },
      { id: "eleven_multilingual_v2", label: "ElevenLabs Multilingual", capability: "narration", tier: "premium" },
    ],
  },
  {
    id: "google_tts",
    label: "Google Cloud TTS",
    capabilities: ["narration"],
    auth: "api_key",
    envKey: "GOOGLE_TTS_API_KEY",
    byok: true,
    implemented: false,
    models: [{ id: "standard", label: "Google TTS Standard", capability: "narration", tier: "economy" }],
  },
  {
    id: "kling",
    label: "Kling (direct)",
    capabilities: ["generative_video"],
    auth: "key_secret",
    envKey: "KLING_API_KEY",
    envSecret: "KLING_API_SECRET",
    byok: true,
    implemented: true,
    models: [
      { id: "kling-v1-6", label: "Kling v1.6", capability: "generative_video", tier: "premium", approxCost: { amount: 0.28, unit: "per_5s_clip" } },
    ],
  },
  {
    id: "fal",
    label: "fal.ai",
    capabilities: ["generative_video"],
    auth: "api_key",
    envKey: "FAL_KEY",
    byok: true,
    implemented: true,
    models: [
      { id: "fal-ai/ltx-video/image-to-video", label: "LTX Video (cheap)", capability: "generative_video", tier: "economy", approxCost: { amount: 0.02, unit: "per_5s_clip" } },
      { id: "fal-ai/wan-i2v", label: "WAN 2.x", capability: "generative_video", tier: "standard", approxCost: { amount: 0.35, unit: "per_5s_clip" } },
      { id: "fal-ai/kling-video/v1.6/standard/image-to-video", label: "Kling via fal", capability: "generative_video", tier: "premium", approxCost: { amount: 0.42, unit: "per_5s_clip" } },
    ],
  },
  {
    id: "remotion",
    label: "Remotion (deterministic)",
    capabilities: ["render"],
    auth: "none",
    byok: false,
    implemented: false,
    models: [{ id: "remotion", label: "Remotion renderer", capability: "render", tier: "economy" }],
  },
  {
    id: "ffmpeg",
    label: "FFmpeg (deterministic)",
    capabilities: ["render"],
    auth: "none",
    byok: false,
    implemented: true,
    models: [{ id: "ffmpeg", label: "FFmpeg renderer", capability: "render", tier: "economy" }],
  },
] as const;

export function getProvider(id: AiProviderId): ProviderEntry | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

/** Implemented providers offering a capability, cheapest tier first. */
export function providersFor(capability: AiCapability): ProviderEntry[] {
  const order: Record<ProviderTier, number> = { economy: 0, standard: 1, premium: 2 };
  return PROVIDER_REGISTRY.filter(
    (p) => p.implemented && p.capabilities.includes(capability)
  ).sort((a, b) => {
    const at = Math.min(...a.models.filter((m) => m.capability === capability).map((m) => order[m.tier]));
    const bt = Math.min(...b.models.filter((m) => m.capability === capability).map((m) => order[m.tier]));
    return at - bt;
  });
}

export function getModel(provider: AiProviderId, modelId: string): ModelEntry | undefined {
  return getProvider(provider)?.models.find((m) => m.id === modelId);
}

/** BYOK-eligible providers (for the settings UI). */
export function byokProviders(): ProviderEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.byok);
}
