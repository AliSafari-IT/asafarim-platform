import "server-only";
import { prisma } from "@asafarim/db";
import {
  PROVIDERS,
  estimateClipCostUsd,
  normalizeProviderId,
  type ProviderId,
  type ProviderMeta,
} from "../ai-providers";

/** Live account/subscription info from a provider that exposes it. */
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
      return {
        state: "error",
        message: `ElevenLabs API returned ${res.status}.`,
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

async function getLiveAccount(meta: ProviderMeta): Promise<LiveAccount> {
  const key = process.env[meta.envKey]?.trim();
  if (!key) return { state: "not_configured" };
  if (!meta.liveAccountApi) return { state: "unsupported" };
  if (meta.id === "elevenlabs") return fetchElevenLabsSubscription(key);
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

/** Build the full Subscriptions view: config + live account + usage. */
export async function getProviderAccounts(): Promise<ProviderAccount[]> {
  const usageByProvider = await getUsageByProvider();
  return Promise.all(
    PROVIDERS.map(async (meta) => {
      const configured = Boolean(process.env[meta.envKey]?.trim());
      const live = await getLiveAccount(meta);
      const usage = usageByProvider.get(meta.id) ?? { ...EMPTY_USAGE };
      return { meta, configured, live, usage } satisfies ProviderAccount;
    })
  );
}

export function totalEstimatedUsd(accounts: ProviderAccount[]): number {
  return accounts.reduce((sum, a) => sum + a.usage.estimatedUsd, 0);
}
