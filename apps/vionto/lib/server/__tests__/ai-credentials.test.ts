import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory ViontoProviderCredential store, keyed by `${userId}:${provider}`.
const { store, viontoProviderCredential } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const key = (userId: string, provider: string) => `${userId}:${provider}`;

  const viontoProviderCredential = {
    findUnique: vi.fn(
      async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) =>
        store.get(key(where.userId_provider.userId, where.userId_provider.provider)) ?? null
    ),
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      [...store.values()].filter((r) => r.userId === where.userId)
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
        select,
      }: {
        where: { userId_provider: { userId: string; provider: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        select: Record<string, boolean>;
      }) => {
        const k = key(where.userId_provider.userId, where.userId_provider.provider);
        const existing = store.get(k);
        const row: Record<string, unknown> = existing
          ? { ...existing, ...update }
          : { ...create, updatedAt: new Date() };
        store.set(k, row);
        return Object.fromEntries(Object.keys(select).map((f) => [f, row[f]]));
      }
    ),
    delete: vi.fn(
      async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) => {
        store.delete(key(where.userId_provider.userId, where.userId_provider.provider));
        return {};
      }
    ),
  };
  return { store, viontoProviderCredential };
});

vi.mock("@asafarim/db", () => ({ prisma: { viontoProviderCredential } }));

import {
  maskKey,
  saveProviderCredential,
  resolveProviderCredential,
  listProviderCredentials,
  deleteProviderCredential,
} from "../ai/credentials";
import { __resetEncryptionKeyCache } from "../google-photos/crypto";

describe("BYOK provider credentials", () => {
  const originalKey = process.env.VIONTO_TOKEN_ENCRYPTION_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const userId = "user_abc";

  beforeEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = "0".repeat(64);
    __resetEncryptionKeyCache();
    store.clear();
  });

  afterEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = originalKey;
    process.env.OPENAI_API_KEY = originalOpenAI;
    __resetEncryptionKeyCache();
  });

  it("masks a key to a short suffix only", () => {
    expect(maskKey("sk-supersecret1234")).toBe("…1234");
    expect(maskKey("abc")).toBe("…");
  });

  it("round-trips: save (encrypted) → resolve (decrypted) → list (masked)", async () => {
    const saved = await saveProviderCredential({ userId, provider: "openai", apiKey: "sk-live-abcd1234" });
    // Never returns the raw key — masked only.
    expect(saved.maskedKey).toBe("…1234");
    expect(JSON.stringify(saved)).not.toContain("sk-live-abcd1234");

    // Stored ciphertext is not the plaintext.
    const stored = store.get(`${userId}:openai`);
    expect(stored?.apiKeyEnc).not.toContain("sk-live-abcd1234");

    // Resolves back to the plaintext for server-side use.
    const resolved = await resolveProviderCredential(userId, "openai");
    expect(resolved).toEqual({ apiKey: "sk-live-abcd1234", apiSecret: undefined, source: "user" });

    const list = await listProviderCredentials(userId);
    expect(list[0].maskedKey).toBe("…1234");
  });

  it("stores and resolves a key+secret pair (Kling)", async () => {
    await saveProviderCredential({ userId, provider: "kling", apiKey: "access-key-xyz", apiSecret: "secret-val-9" });
    const resolved = await resolveProviderCredential(userId, "kling");
    expect(resolved.apiKey).toBe("access-key-xyz");
    expect(resolved.apiSecret).toBe("secret-val-9");
    expect(resolved.source).toBe("user");
  });

  it("falls back to the server env key when the user has none", async () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    const resolved = await resolveProviderCredential(userId, "openai");
    expect(resolved).toEqual({ apiKey: "sk-env-fallback", apiSecret: undefined, source: "env" });
  });

  it("returns source 'none' when neither user key nor env is set", async () => {
    delete process.env.OPENAI_API_KEY;
    const resolved = await resolveProviderCredential(userId, "openai");
    expect(resolved.source).toBe("none");
  });

  it("forces BYOK when env fallback is disallowed", async () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    const resolved = await resolveProviderCredential(userId, "openai", { allowEnvFallback: false });
    expect(resolved.source).toBe("none");
  });

  it("prefers the user key over the env fallback", async () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    await saveProviderCredential({ userId, provider: "openai", apiKey: "sk-user-owns-this" });
    const resolved = await resolveProviderCredential(userId, "openai");
    expect(resolved.apiKey).toBe("sk-user-owns-this");
    expect(resolved.source).toBe("user");
  });

  it("deletes a stored key, then falls back to env again", async () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    await saveProviderCredential({ userId, provider: "openai", apiKey: "sk-user-owns-this" });
    await deleteProviderCredential(userId, "openai");
    const resolved = await resolveProviderCredential(userId, "openai");
    expect(resolved.source).toBe("env");
  });
});
