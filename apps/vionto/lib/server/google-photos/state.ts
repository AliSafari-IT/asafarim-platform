/**
 * Signed OAuth `state` tokens for the Google Photos connect flow.
 *
 * The state carries the initiating user id, a return URL, and a nonce, and is
 * signed with HMAC-SHA256 so the callback can trust it (CSRF protection). The
 * signing key is derived from AUTH_SECRET (already required by the app), with a
 * fallback to the token-encryption key.
 */
import { createHmac } from "node:crypto";

import { safeEqual } from "./crypto";

export type OAuthState = {
  /** Vionto user that started the connect flow. */
  userId: string;
  /** Where to send the user after the callback completes. */
  returnTo: string;
  /** Random nonce — single-use-ish, also makes each state unique. */
  nonce: string;
  /** Issued-at (epoch seconds). */
  iat: number;
};

const STATE_TTL_SECONDS = 10 * 60; // 10 minutes to complete consent

function getSigningKey(): string {
  const key =
    process.env.AUTH_SECRET?.trim() ||
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      "Cannot sign OAuth state: neither AUTH_SECRET nor VIONTO_TOKEN_ENCRYPTION_KEY is set.",
    );
  }
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
}

/** Encode + sign a state object into a compact `payload.signature` token. */
export function signState(
  input: Omit<OAuthState, "iat" | "nonce"> & { nonce?: string },
): string {
  const state: OAuthState = {
    userId: input.userId,
    returnTo: input.returnTo,
    nonce: input.nonce ?? cryptoRandom(),
    iat: Math.floor(Date.now() / 1000),
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a state token's signature and freshness. Returns the decoded state or
 * `null` if it is malformed, tampered, or expired.
 */
export function verifyState(token: string | null | undefined): OAuthState | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof state.userId !== "string" ||
    typeof state.returnTo !== "string" ||
    typeof state.iat !== "number"
  ) {
    return null;
  }
  if (Math.floor(Date.now() / 1000) - state.iat > STATE_TTL_SECONDS) return null;

  return state;
}

function cryptoRandom(): string {
  // 16 random bytes, base64url — enough entropy for a nonce.
  return Buffer.from(
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)),
  ).toString("base64url");
}
