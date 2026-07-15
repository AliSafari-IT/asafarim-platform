/**
 * Low-level Google OAuth operations for the Photos integration:
 * build consent URL, exchange code, refresh, revoke, and fetch account info.
 *
 * All network calls go through {@link fetchWithRetry} so they tolerate
 * transient 429/5xx responses.
 */
import {
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_REVOKE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getGooglePhotosConfig,
} from "./config";
import { fetchWithRetry, readJson } from "./http";

export type TokenResponse = {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/** Tokens normalized for storage, with an absolute expiry. */
export type ExchangedTokens = {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date;
};

function expiryFromNow(expiresInSec: number): Date {
  // Refresh 60s early to avoid using a token that expires mid-request.
  return new Date(Date.now() + Math.max(0, expiresInSec - 60) * 1000);
}

function toScopes(scope: string | undefined, fallback: string[]): string[] {
  if (!scope) return fallback;
  return scope.split(/\s+/).filter(Boolean);
}

/** Build the Google consent URL. `state` is the signed CSRF/return token. */
export function buildAuthUrl(state: string): string {
  const cfg = getGooglePhotosConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    // Guarantee a refresh token on first grant + re-consent.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const cfg = getGooglePhotosConfig();
  const res = await fetchWithRetry(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = await readJson<TokenResponse>(res);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    scopes: toScopes(data.scope, cfg.scopes),
    expiresAt: expiryFromNow(data.expires_in),
  };
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
  scopes: string[] | null;
}> {
  const cfg = getGooglePhotosConfig();
  const res = await fetchWithRetry(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = await readJson<TokenResponse>(res);
  return {
    accessToken: data.access_token,
    expiresAt: expiryFromNow(data.expires_in),
    scopes: data.scope ? toScopes(data.scope, []) : null,
  };
}

/** Revoke a token at Google (used on disconnect). Best-effort. */
export async function revokeToken(token: string): Promise<void> {
  await fetchWithRetry(GOOGLE_OAUTH_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
}

/** Fetch the connected Google account's profile (sub + email). */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetchWithRetry(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readJson<GoogleUserInfo>(res);
}
