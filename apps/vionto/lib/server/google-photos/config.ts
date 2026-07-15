/**
 * Environment-driven configuration for the Google Photos integration.
 *
 * Kept in one place so routes and helpers never read `process.env` directly
 * and so missing configuration fails with a clear, actionable message.
 */

export const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_PICKER_API_BASE = "https://photospicker.googleapis.com/v1";

/** Default scope: the non-sensitive Photos Picker read scope. */
export const DEFAULT_PICKER_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

/** OpenID scopes we always request so we can identify the connected account. */
const IDENTITY_SCOPES = ["openid", "email", "profile"];

export type GooglePhotosConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Full scope list sent to Google (identity scopes + Photos scopes). */
  scopes: string[];
};

/** Parse `GOOGLE_PHOTOS_SCOPES` (space- or comma-separated) → unique list. */
export function parseScopes(raw: string | undefined): string[] {
  const photoScopes = (raw ?? DEFAULT_PICKER_SCOPE)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...IDENTITY_SCOPES, ...photoScopes]));
}

/**
 * Resolve the OAuth config from the environment. Throws if the client
 * credentials or redirect URI are missing — these are required for any
 * connect/refresh operation.
 */
export function getGooglePhotosConfig(): GooglePhotosConfig {
  const clientId = process.env.GOOGLE_PHOTOS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_PHOTOS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_PHOTOS_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Photos OAuth is not configured. Set GOOGLE_PHOTOS_CLIENT_ID, " +
        "GOOGLE_PHOTOS_CLIENT_SECRET and GOOGLE_PHOTOS_REDIRECT_URI.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: parseScopes(process.env.GOOGLE_PHOTOS_SCOPES),
  };
}

/** Whether OAuth is configured (without throwing) — used by status checks. */
export function isGooglePhotosConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_PHOTOS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_PHOTOS_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_PHOTOS_REDIRECT_URI?.trim(),
  );
}

/**
 * Direct shared-album-URL import (Library API sharing) is gated behind a
 * restricted scope + Google security assessment. Until that is approved this
 * flag stays false and the shared-album endpoint returns a "use the picker"
 * fallback. See docs/google-photos-import.md §4.
 */
export function isSharedAlbumImportEnabled(): boolean {
  return process.env.GOOGLE_PHOTOS_SHARING_ENABLED === "true";
}
