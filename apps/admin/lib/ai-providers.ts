/**
 * Admin-side catalogue of the AI providers Vionto can use, with the info the
 * Subscriptions page needs: display label, billing-dashboard URL, whether the
 * provider exposes account/subscription data over its API, and rough per-clip
 * cost used to estimate spend from our own generation log (ViontoAiClip).
 *
 * Cost figures mirror `apps/vionto/lib/server/ai/registry.ts` (approxCost,
 * per 5-second clip). Keep them roughly in sync; they are estimates only.
 */

export type ProviderId =
  | "fal"
  | "kling"
  | "elevenlabs"
  | "openai"
  | "anthropic";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** What we use it for, shown as a subtitle. */
  role: string;
  /** Where the user manages billing for this provider. */
  dashboardUrl: string;
  /** Env var holding the server-side key (used only to report "configured"). */
  envKey: string;
  /**
   * Whether the provider exposes account/subscription data we can fetch live.
   * Only ElevenLabs does today; the rest are dashboard-only.
   */
  liveAccountApi: boolean;
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "fal",
    label: "fal.ai",
    role: "AI motion clips (LTX / WAN / Kling)",
    dashboardUrl: "https://fal.ai/dashboard/billing",
    envKey: "FAL_KEY",
    liveAccountApi: false,
  },
  {
    id: "kling",
    label: "Kling (direct)",
    role: "AI motion clips",
    dashboardUrl: "https://app.klingai.com",
    envKey: "KLING_API_KEY",
    liveAccountApi: false,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    role: "Narration / text-to-speech",
    dashboardUrl: "https://elevenlabs.io/app/subscription",
    envKey: "ELEVENLABS_API_KEY",
    liveAccountApi: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    role: "Story & narration",
    dashboardUrl: "https://platform.openai.com/settings/organization/billing/overview",
    envKey: "OPENAI_API_KEY",
    liveAccountApi: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    role: "Story generation",
    dashboardUrl: "https://console.anthropic.com/settings/billing",
    envKey: "ANTHROPIC_API_KEY",
    liveAccountApi: false,
  },
] as const;

/** Rough USD cost per 5-second clip, keyed by model id (fal + kling). */
const CLIP_COST_PER_5S: Record<string, number> = {
  "fal-ai/ltx-video/image-to-video": 0.02,
  "fal-ai/wan-i2v": 0.35,
  "fal-ai/kling-video/v1.6/standard/image-to-video": 0.42,
  "fal-ai/kling-video/v1.6/pro/image-to-video": 0.55,
  "kling-v1-6": 0.28,
};

/**
 * Estimate the USD cost of a single generated clip. Falls back to a matching
 * model prefix, then to 0 (unknown model) so totals never NaN.
 */
export function estimateClipCostUsd(
  model: string,
  durationSeconds: number
): number {
  let per5s = CLIP_COST_PER_5S[model];
  if (per5s === undefined) {
    const prefix = Object.keys(CLIP_COST_PER_5S).find((k) =>
      model.startsWith(k.split("/").slice(0, 2).join("/"))
    );
    per5s = prefix ? CLIP_COST_PER_5S[prefix] : 0;
  }
  const units = (durationSeconds || 5) / 5;
  return per5s * units;
}

/** Map a Vionto clip `provider` string to our catalogue id. */
export function normalizeProviderId(provider: string): ProviderId | null {
  const p = provider.toLowerCase();
  if (p === "fal" || p === "fal.ai") return "fal";
  if (p === "kling") return "kling";
  if (p === "elevenlabs") return "elevenlabs";
  if (p === "openai") return "openai";
  if (p === "anthropic") return "anthropic";
  return null;
}
