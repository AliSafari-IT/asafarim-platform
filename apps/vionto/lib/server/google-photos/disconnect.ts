/**
 * Disconnect a user's Google Photos connection: revoke the tokens at Google
 * (best-effort) and delete the stored connection. Used by the disconnect route
 * and by account-deletion / retention flows so no orphaned grant survives
 * (issue #156).
 */
import {
  deleteGooglePhotosConnection,
  getGooglePhotosConnection,
} from "./connection";
import { revokeToken } from "./oauth";

export type DisconnectResult = {
  existed: boolean;
  revoked: boolean;
};

export async function revokeAndDeleteGooglePhotosConnection(
  userId: string,
): Promise<DisconnectResult> {
  const connection = await getGooglePhotosConnection(userId);
  if (!connection) return { existed: false, revoked: false };

  let revoked = false;
  // Revoking the refresh token invalidates the whole grant; fall back to the
  // access token. Never let a revoke failure block local deletion.
  const tokenToRevoke = connection.refreshToken ?? connection.accessToken;
  try {
    await revokeToken(tokenToRevoke);
    revoked = true;
  } catch {
    revoked = false;
  }

  await deleteGooglePhotosConnection(userId);
  return { existed: true, revoked };
}
