import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above top-level declarations, so the store and mock
// must be created inside `vi.hoisted` to be referenceable from the factory.
const { store, googlePhotosConnection } = vi.hoisted(() => {
  // In-memory stand-in for the single-row-per-user connection table.
  const store = new Map<string, Record<string, unknown>>();

  const googlePhotosConnection = {
    findUnique: vi.fn(
      async ({ where: { userId } }: { where: { userId: string } }) =>
        store.get(userId) ?? null,
    ),
    upsert: vi.fn(
      async ({
        where: { userId },
        create,
        update,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = store.get(userId);
        const now = new Date();
        const row = existing
          ? { ...existing, ...update, updatedAt: now }
          : {
              id: `cuid_${userId}`,
              createdAt: now,
              updatedAt: now,
              googleAccountEmail: null,
              googleAccountSub: null,
              refreshTokenEnc: null,
              expiresAt: null,
              lastError: null,
              lastRefreshAt: null,
              lastImportedAt: null,
              ...create,
            };
        store.set(userId, row);
        return row;
      },
    ),
    update: vi.fn(
      async ({
        where: { userId },
        data,
      }: {
        where: { userId: string };
        data: Record<string, unknown>;
      }) => {
        const existing = store.get(userId);
        if (!existing) throw new Error("Record not found");
        const row = { ...existing, ...data, updatedAt: new Date() };
        store.set(userId, row);
        return row;
      },
    ),
    deleteMany: vi.fn(
      async ({ where: { userId } }: { where: { userId: string } }) => {
        const had = store.has(userId);
        store.delete(userId);
        return { count: had ? 1 : 0 };
      },
    ),
  };

  return { store, googlePhotosConnection };
});

vi.mock("@asafarim/db", () => ({
  prisma: { googlePhotosConnection },
}));

// Import after the mock is registered.
import {
  deleteGooglePhotosConnection,
  getGooglePhotosConnection,
  markGooglePhotosConnectionError,
  updateGooglePhotosAccessToken,
  upsertGooglePhotosConnection,
} from "../google-photos/connection";
import { __resetEncryptionKeyCache } from "../google-photos/crypto";

describe("google-photos connection repository", () => {
  const originalKey = process.env.VIONTO_TOKEN_ENCRYPTION_KEY;
  const userId = "user_123";

  beforeEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = "0".repeat(64);
    __resetEncryptionKeyCache();
    store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = originalKey;
    __resetEncryptionKeyCache();
  });

  it("returns null when no connection exists", async () => {
    expect(await getGooglePhotosConnection(userId)).toBeNull();
  });

  it("encrypts tokens at rest and decrypts them on read", async () => {
    await upsertGooglePhotosConnection({
      userId,
      accessToken: "access-abc",
      refreshToken: "refresh-xyz",
      scopes: ["https://www.googleapis.com/auth/photospicker.mediaitems.readonly"],
      googleAccountEmail: "photos@gmail.com",
      googleAccountSub: "sub-1",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });

    // Raw stored row must not contain plaintext tokens.
    const raw = store.get(userId)!;
    expect(raw.accessTokenEnc).not.toBe("access-abc");
    expect(String(raw.accessTokenEnc)).not.toContain("access-abc");
    expect(String(raw.refreshTokenEnc)).not.toContain("refresh-xyz");

    const view = await getGooglePhotosConnection(userId);
    expect(view).not.toBeNull();
    expect(view!.accessToken).toBe("access-abc");
    expect(view!.refreshToken).toBe("refresh-xyz");
    expect(view!.googleAccountEmail).toBe("photos@gmail.com");
    expect(view!.scopes).toHaveLength(1);
    expect(view!.status).toBe("active");
  });

  it("preserves the existing refresh token when an update omits it", async () => {
    await upsertGooglePhotosConnection({
      userId,
      accessToken: "access-1",
      refreshToken: "refresh-original",
      scopes: ["scope-a"],
    });

    // Re-grant without a refresh token (Google omits it on subsequent grants).
    await upsertGooglePhotosConnection({
      userId,
      accessToken: "access-2",
      scopes: ["scope-a", "scope-b"],
    });

    const view = await getGooglePhotosConnection(userId);
    expect(view!.accessToken).toBe("access-2");
    expect(view!.refreshToken).toBe("refresh-original");
    expect(view!.scopes).toEqual(["scope-a", "scope-b"]);
  });

  it("updates the access token and refresh timestamp on refresh", async () => {
    await upsertGooglePhotosConnection({
      userId,
      accessToken: "old",
      refreshToken: "r",
      scopes: ["s"],
    });

    const newExpiry = new Date("2031-06-01T00:00:00Z");
    await updateGooglePhotosAccessToken(userId, "new-access", newExpiry);

    const view = await getGooglePhotosConnection(userId);
    expect(view!.accessToken).toBe("new-access");
    expect(view!.refreshToken).toBe("r");
    expect(view!.expiresAt?.toISOString()).toBe(newExpiry.toISOString());
    expect(view!.lastRefreshAt).toBeInstanceOf(Date);
  });

  it("marks a connection as errored", async () => {
    await upsertGooglePhotosConnection({
      userId,
      accessToken: "a",
      refreshToken: "r",
      scopes: ["s"],
    });
    await markGooglePhotosConnectionError(userId, "refresh token revoked");

    const view = await getGooglePhotosConnection(userId);
    expect(view!.status).toBe("error");
    expect(view!.lastError).toBe("refresh token revoked");
  });

  it("deletes a connection and reports whether a row was removed", async () => {
    expect(await deleteGooglePhotosConnection(userId)).toBe(false);

    await upsertGooglePhotosConnection({
      userId,
      accessToken: "a",
      refreshToken: "r",
      scopes: ["s"],
    });
    expect(await deleteGooglePhotosConnection(userId)).toBe(true);
    expect(await getGooglePhotosConnection(userId)).toBeNull();
  });
});
