/**
 * Access-token freshness for the Google Photos integration.
 *
 * `getValidGooglePhotosAccessToken` is the single entry point every Google API
 * caller (picker, ingest) uses. It returns a non-expired access token,
 * transparently refreshing via the stored refresh token and persisting the new
 * token. Failures are surfaced as a typed {@link GooglePhotosAuthError} so
 * routes can map them to a "reconnect" response.
 */
import {
  getGooglePhotosConnection,
  markGooglePhotosConnectionError,
  updateGooglePhotosAccessToken,
} from "./connection";
import { refreshAccessToken } from "./oauth";

export type GooglePhotosAuthErrorCode =
  | "not_connected"
  | "no_refresh_token"
  | "refresh_failed"
  | "revoked";

export class GooglePhotosAuthError extends Error {
  readonly code: GooglePhotosAuthErrorCode;
  constructor(code: GooglePhotosAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GooglePhotosAuthError";
    this.code = code;
  }
}

/** 30-second skew so we never hand back a token that's about to expire. */
const EXPIRY_SKEW_MS = 30 * 1000;

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now();
}

/**
 * Return a valid access token for the user, refreshing if needed.
 * @throws {GooglePhotosAuthError}
 */
export async function getValidGooglePhotosAccessToken(
  userId: string,
): Promise<string> {
  const connection = await getGooglePhotosConnection(userId);
  if (!connection || connection.status === "revoked") {
    throw new GooglePhotosAuthError("not_connected");
  }

  if (!isExpired(connection.expiresAt)) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    await markGooglePhotosConnectionError(userId, "Access token expired and no refresh token on file");
    throw new GooglePhotosAuthError("no_refresh_token");
  }

  try {
    const refreshed = await refreshAccessToken(connection.refreshToken);
    await updateGooglePhotosAccessToken(userId, refreshed.accessToken, refreshed.expiresAt);
    return refreshed.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A 400 invalid_grant means the refresh token was revoked or expired.
    const revoked = /invalid_grant/i.test(message);
    await markGooglePhotosConnectionError(userId, message);
    throw new GooglePhotosAuthError(
      revoked ? "revoked" : "refresh_failed",
      message,
    );
  }
}
