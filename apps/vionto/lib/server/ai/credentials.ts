/**
 * Provider credential resolution (bring-your-own-key).
 *
 * Keys are stored per-user, AES-256-GCM encrypted, reusing the Google Photos
 * crypto helper. At call time we resolve in this order:
 *   1. the user's stored credential (decrypted)
 *   2. the server env fallback (your keys)
 *
 * Plaintext keys never leave the server and are never returned to clients —
 * the settings API only ever exposes a masked hint.
 */
import { prisma } from "@asafarim/db";
import { encryptToken, decryptToken } from "../google-photos/crypto";
import { getProvider } from "./registry";
import type { AiProviderId } from "./types";

export interface ResolvedCredential {
  apiKey?: string;
  apiSecret?: string;
  /** Where the key came from — useful for admin-only fallback policies. */
  source: "user" | "env" | "none";
}

/** Mask a secret for display: keep a short suffix only. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "…";
  return `…${trimmed.slice(-4)}`;
}

/** Read the server env fallback for a provider, if configured. */
function envCredential(provider: AiProviderId): ResolvedCredential | null {
  const entry = getProvider(provider);
  if (!entry) return null;
  const apiKey = entry.envKey ? process.env[entry.envKey]?.trim() : undefined;
  const apiSecret = entry.envSecret ? process.env[entry.envSecret]?.trim() : undefined;
  if (!apiKey && !apiSecret) return null;
  return { apiKey: apiKey || undefined, apiSecret: apiSecret || undefined, source: "env" };
}

/**
 * Resolve a usable credential for (user, provider): the user's own key if set,
 * otherwise the server env fallback, otherwise `{ source: "none" }`.
 *
 * `allowEnvFallback: false` forces BYOK — used when the key policy restricts
 * the server key to the owner only.
 */
export async function resolveProviderCredential(
  userId: string,
  provider: AiProviderId,
  opts: { allowEnvFallback?: boolean } = {}
): Promise<ResolvedCredential> {
  const { allowEnvFallback = true } = opts;

  const row = await prisma.viontoProviderCredential.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { apiKeyEnc: true, apiSecretEnc: true, status: true },
  });

  if (row && row.status === "active") {
    try {
      return {
        apiKey: decryptToken(row.apiKeyEnc),
        apiSecret: row.apiSecretEnc ? decryptToken(row.apiSecretEnc) : undefined,
        source: "user",
      };
    } catch {
      // Corrupt/undecryptable stored key — fall through to env.
    }
  }

  if (allowEnvFallback) {
    const env = envCredential(provider);
    if (env) return env;
  }

  return { source: "none" };
}

export interface SaveCredentialInput {
  userId: string;
  provider: AiProviderId;
  apiKey: string;
  apiSecret?: string;
  label?: string;
}

/** Encrypt and upsert a user's provider key. Returns the masked view only. */
export async function saveProviderCredential(input: SaveCredentialInput) {
  const maskedKey = maskKey(input.apiKey);
  const data = {
    apiKeyEnc: encryptToken(input.apiKey),
    apiSecretEnc: input.apiSecret ? encryptToken(input.apiSecret) : null,
    label: input.label ?? null,
    maskedKey,
    status: "active",
    lastError: null,
  };
  const row = await prisma.viontoProviderCredential.upsert({
    where: { userId_provider: { userId: input.userId, provider: input.provider } },
    create: { userId: input.userId, provider: input.provider, ...data },
    update: data,
    select: { provider: true, label: true, maskedKey: true, status: true, updatedAt: true },
  });
  return row;
}

/** Remove a user's stored key for a provider. */
export async function deleteProviderCredential(userId: string, provider: AiProviderId) {
  await prisma.viontoProviderCredential
    .delete({ where: { userId_provider: { userId, provider } } })
    .catch(() => null);
}

/** List a user's configured providers (masked) for the settings UI. */
export async function listProviderCredentials(userId: string) {
  return prisma.viontoProviderCredential.findMany({
    where: { userId },
    select: { provider: true, label: true, maskedKey: true, status: true, lastVerifiedAt: true, updatedAt: true },
    orderBy: { provider: "asc" },
  });
}
