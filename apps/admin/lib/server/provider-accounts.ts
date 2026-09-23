import "server-only";
import { prisma, getEffectiveSetting } from "@asafarim/db";
import {
  PROVIDERS,
  estimateClipCostUsd,
  normalizeProviderId,
  type ProviderId,
  type ProviderMeta,
} from "../ai-providers";

/**
 * Live account/subscription info from a provider that exposes it.
 * 
 * Note: Only ElevenLabs returns account/subscription data to a normal API key.
 * For other providers (fal.ai, OpenAI, Anthropic, Kling), balances and renewal
 * dates live on each provider's dashboard; the figures above are estimated from
 * Vionto's own generation log.
 */
export type LiveAccount =
  | {
      state: "ok";
      tier: string | null;
      status: string | null;
      /** Characters used this cycle / included limit (ElevenLabs). */
      usedChars: number | null;
      limitChars: number | null;
      /** Next reset / renewal date, if provided. */
      nextResetAt: string | null;
    }
  | { state: "not_configured" }
  | { state: "unsupported" }
  | { state: "error"; message: string };

/** Per-provider usage rolled up from our own ViontoAiClip generation log. */
export interface ProviderUsage {
  clips: number;
  succeeded: number;
  failed: number;
  totalSeconds: number;
  estimatedUsd: number;
  lastActivity: string | null;
}

export interface ProviderAccount {
  meta: ProviderMeta;
  configured: boolean;
  live: LiveAccount;
  usage: ProviderUsage;
}

const EMPTY_USAGE: ProviderUsage = {
  clips: 0,
  succeeded: 0,
  failed: 0,
  totalSeconds: 0,
  estimatedUsd: 0,
  lastActivity: null,
};

/**
 * Query ElevenLabs for the current subscription. This is the only provider in
 * our stack that returns account/subscription data to a normal API key.
 */
async function fetchElevenLabsSubscription(
  apiKey: string
): Promise<LiveAccount> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://api.elevenlabs.io/v1/user/subscription",
      {
        headers: { "xi-api-key": apiKey },
        signal: controller.signal,
        cache: "no-store",
      }
    ).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      // ElevenLabs returns a structured reason (e.g. a scoped key missing the
      // `user_read` permission) — surface it so the fix is obvious.
      const detail = (await res.json().catch(() => null)) as {
        detail?: { message?: string };
      } | null;
      const reason = detail?.detail?.message;
      return {
        state: "error",
        message: reason
          ? `ElevenLabs: ${reason}`
          : `ElevenLabs API returned ${res.status}.`,
      };
    }
    const data = (await res.json()) as {
      tier?: string;
      status?: string;
      character_count?: number;
      character_limit?: number;
      next_character_count_reset_unix?: number;
    };
    return {
      state: "ok",
      tier: data.tier ?? null,
      status: data.status ?? null,
      usedChars: data.character_count ?? null,
      limitChars: data.character_limit ?? null,
      nextResetAt: data.next_character_count_reset_unix
        ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
        : null,
    };
  } catch (err) {
    return {
      state: "error",
      message:
        err instanceof Error && err.name === "AbortError"
          ? "ElevenLabs API timed out."
          : "Could not reach the ElevenLabs API.",
    };
  }
}

/**
 * `configured` is passed in (already resolved env-or-settings) so this
 * never contradicts the same page's "configured" badge by falling back to
 * an env-only check of its own. The env var's actual value is only needed
 * for a real API call (elevenlabs today) — which has no settingsKey, so a
 * console-only key can't reach this branch anyway.
 */
async function getLiveAccount(meta: ProviderMeta, configured: boolean): Promise<LiveAccount> {
  if (!configured) return { state: "not_configured" };
  if (!meta.liveAccountApi) return { state: "unsupported" };
  const key = process.env[meta.envKey]?.trim();
  if (meta.id === "elevenlabs" && key) return fetchElevenLabsSubscription(key);
  return { state: "unsupported" };
}

/** Aggregate the ViontoAiClip log into per-provider usage + estimated spend. */
async function getUsageByProvider(): Promise<Map<ProviderId, ProviderUsage>> {
  const usage = new Map<ProviderId, ProviderUsage>();
  const clips = await prisma.viontoAiClip.findMany({
    select: {
      provider: true,
      model: true,
      durationSeconds: true,
      outputDurationSeconds: true,
      status: true,
      createdAt: true,
    },
  });

  for (const clip of clips) {
    const id = normalizeProviderId(clip.provider);
    if (!id) continue;
    const current = usage.get(id) ?? { ...EMPTY_USAGE };
    const seconds = clip.outputDurationSeconds ?? clip.durationSeconds ?? 0;
    current.clips += 1;
    if (clip.status === "succeeded") {
      current.succeeded += 1;
      // Only successful clips are billable — estimate spend on those.
      current.estimatedUsd += estimateClipCostUsd(clip.model, seconds);
      current.totalSeconds += seconds;
    } else if (clip.status === "failed") {
      current.failed += 1;
    }
    const ts = clip.createdAt.toISOString();
    if (!current.lastActivity || ts > current.lastActivity) {
      current.lastActivity = ts;
    }
    usage.set(id, current);
  }
  return usage;
}

/**
 * "Configured" is env var OR a console-set key (`meta.settingsKey`), so the
 * Subscriptions page reflects a key an admin rotated through the UI, not
 * only one baked into the deployment's environment. A secret's decrypted
 * value is never read here — `getEffectiveSetting`'s `overridden` flag is
 * enough to know one is set.
 */
async function isProviderConfigured(meta: ProviderMeta): Promise<boolean> {
  if (process.env[meta.envKey]?.trim()) return true;
  if (!meta.settingsKey) return false;
  try {
    const effective = await getEffectiveSetting(meta.settingsKey);
    return effective?.overridden ?? false;
  } catch (error) {
    // Settings store unreachable: we already know the env var is unset (the
    // check above), so this provider is honestly not configured right now —
    // never throw and break the whole Subscriptions page over it.
    console.error(`[admin] failed to read "${meta.settingsKey}" for configured check:`, error);
    return false;
  }
}

/** Build the full Subscriptions view: config + live account + usage. */
export async function getProviderAccounts(): Promise<ProviderAccount[]> {
  const usageByProvider = await getUsageByProvider();
  return Promise.all(
    PROVIDERS.map(async (meta) => {
      const configured = await isProviderConfigured(meta);
      const live = await getLiveAccount(meta, configured);
      const usage = usageByProvider.get(meta.id) ?? { ...EMPTY_USAGE };
      return { meta, configured, live, usage } satisfies ProviderAccount;
    })
  );
}

export function totalEstimatedUsd(accounts: ProviderAccount[]): number {
  return accounts.reduce((sum, a) => sum + a.usage.estimatedUsd, 0);
}
