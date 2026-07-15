/**
 * Token encryption for the Google Photos integration.
 *
 * OAuth access/refresh tokens are sensitive credentials and must never be
 * stored in plaintext. We encrypt them at rest with AES-256-GCM (authenticated
 * encryption — tampering is detected on decrypt).
 *
 * Key: `VIONTO_TOKEN_ENCRYPTION_KEY` — a 32-byte key provided as either
 *   - 64 hex characters, or
 *   - base64 / base64url that decodes to 32 bytes.
 *
 * Generate one with:  `openssl rand -hex 32`
 *
 * Encrypted payload format (all parts base64url, dot-separated):
 *   <iv>.<authTag>.<ciphertext>
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce — recommended for GCM
const KEY_BYTES = 32; // AES-256
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/** Resolve and validate the 32-byte encryption key from the environment. */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.VIONTO_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "VIONTO_TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.",
    );
  }

  const trimmed = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    // Accept base64 or base64url.
    key = Buffer.from(trimmed, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `VIONTO_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Provide 64 hex chars or a base64-encoded 32-byte key.",
    );
  }

  cachedKey = key;
  return key;
}

/** Reset the cached key — used by tests that mutate the env. */
export function __resetEncryptionKeyCache(): void {
  cachedKey = null;
}

/** Encrypt a UTF-8 string. Returns `iv.authTag.ciphertext` (base64url parts). */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt a payload produced by {@link encryptToken}. Throws on tampering. */
export function decryptToken(payload: string): string {
  const key = getEncryptionKey();
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token payload");
  }

  const iv = Buffer.from(parts[0], "base64url");
  const authTag = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Malformed encrypted token payload");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time string comparison (e.g. for OAuth `state` validation). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
