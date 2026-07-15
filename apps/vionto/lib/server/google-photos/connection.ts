/**
 * Repository for a user's Google Photos authorization.
 *
 * Wraps the `GooglePhotosConnection` table and handles transparent
 * encryption/decryption of the stored OAuth tokens. Higher layers (the OAuth
 * connect/callback routes, token-refresh helper, picker/import endpoints)
 * should go through these functions and never read the encrypted columns
 * directly.
 *
 * Foundation milestone: this is the persistence layer only. The token-refresh
 * logic, status/disconnect endpoints, and Google API calls are implemented in
 * their own milestone issues.
 */
import { prisma } from "@asafarim/db";

import { decryptToken, encryptToken } from "./crypto";

export type GooglePhotosConnectionStatus = "active" | "revoked" | "error";

/** Plaintext view of a connection, as used by the rest of the app. */
export type GooglePhotosConnectionView = {
  id: string;
  userId: string;
  googleAccountEmail: string | null;
  googleAccountSub: string | null;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
  status: GooglePhotosConnectionStatus;
  lastError: string | null;
  lastRefreshAt: Date | null;
  lastImportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Input for creating/updating a connection (plaintext tokens). */
export type UpsertGooglePhotosConnectionInput = {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  scopes: string[];
  expiresAt?: Date | null;
  googleAccountEmail?: string | null;
  googleAccountSub?: string | null;
  status?: GooglePhotosConnectionStatus;
};

type ConnectionRow = {
  id: string;
  userId: string;
  googleAccountEmail: string | null;
  googleAccountSub: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  scopes: string[];
  expiresAt: Date | null;
  status: string;
  lastError: string | null;
  lastRefreshAt: Date | null;
  lastImportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: ConnectionRow): GooglePhotosConnectionView {
  return {
    id: row.id,
    userId: row.userId,
    googleAccountEmail: row.googleAccountEmail,
    googleAccountSub: row.googleAccountSub,
    accessToken: decryptToken(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc ? decryptToken(row.refreshTokenEnc) : null,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    status: row.status as GooglePhotosConnectionStatus,
    lastError: row.lastError,
    lastRefreshAt: row.lastRefreshAt,
    lastImportedAt: row.lastImportedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Fetch and decrypt the caller's connection, or `null` if none exists. */
export async function getGooglePhotosConnection(
  userId: string,
): Promise<GooglePhotosConnectionView | null> {
  const row = await prisma.googlePhotosConnection.findUnique({
    where: { userId },
  });
  return row ? toView(row as ConnectionRow) : null;
}

/**
 * Create or update the caller's connection, encrypting tokens before storage.
 * A missing `refreshToken` leaves any previously stored refresh token intact
 * (Google only returns a refresh token on the first/consent grant).
 */
export async function upsertGooglePhotosConnection(
  input: UpsertGooglePhotosConnectionInput,
): Promise<GooglePhotosConnectionView> {
  const accessTokenEnc = encryptToken(input.accessToken);
  const refreshTokenEnc =
    input.refreshToken != null ? encryptToken(input.refreshToken) : undefined;

  const status = input.status ?? "active";

  const row = await prisma.googlePhotosConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      accessTokenEnc,
      // On create, store whatever refresh token we have (may be null).
      refreshTokenEnc: refreshTokenEnc ?? null,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      googleAccountEmail: input.googleAccountEmail ?? null,
      googleAccountSub: input.googleAccountSub ?? null,
      status,
      lastError: null,
    },
    update: {
      accessTokenEnc,
      // Only overwrite the refresh token when a new one is provided.
      ...(refreshTokenEnc !== undefined ? { refreshTokenEnc } : {}),
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      ...(input.googleAccountEmail !== undefined
        ? { googleAccountEmail: input.googleAccountEmail }
        : {}),
      ...(input.googleAccountSub !== undefined
        ? { googleAccountSub: input.googleAccountSub }
        : {}),
      status,
      lastError: null,
    },
  });

  return toView(row as ConnectionRow);
}

/**
 * Persist a refreshed access token (and its new expiry) without touching the
 * refresh token or other fields. Marks the connection active.
 */
export async function updateGooglePhotosAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: Date | null,
): Promise<void> {
  await prisma.googlePhotosConnection.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptToken(accessToken),
      expiresAt,
      status: "active",
      lastError: null,
      lastRefreshAt: new Date(),
    },
  });
}

/** Record that the user just imported media (diagnostics only). */
export async function touchGooglePhotosImportedAt(userId: string): Promise<void> {
  await prisma.googlePhotosConnection.update({
    where: { userId },
    data: { lastImportedAt: new Date() },
  });
}

/** Flag a connection as errored (e.g. refresh failed, scope revoked). */
export async function markGooglePhotosConnectionError(
  userId: string,
  error: string,
): Promise<void> {
  await prisma.googlePhotosConnection.update({
    where: { userId },
    data: { status: "error", lastError: error.slice(0, 2000) },
  });
}

/**
 * Remove the caller's connection entirely (called on disconnect and on
 * account deletion). Returns true if a row was deleted.
 */
export async function deleteGooglePhotosConnection(
  userId: string,
): Promise<boolean> {
  const result = await prisma.googlePhotosConnection.deleteMany({
    where: { userId },
  });
  return result.count > 0;
}
