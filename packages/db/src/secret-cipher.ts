import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM encryption for PlatformSetting "secret" values.
 *
 * Deliberately keyed by its own `SETTINGS_ENCRYPTION_KEY` rather than
 * reusing `AUTH_SECRET` — rotating one must never force rotating the other,
 * and a leak of one key must not also expose the other's ciphertexts.
 *
 * Envelope format: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`.
 * The version prefix lets a future cipher change (key rotation, algorithm
 * change) decrypt old rows written under `v1` while writing new ones under
 * `v2`, without a data migration.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
// Pinned on both sides: without it, Node's decipher accepts a truncated tag
// (down to 4 bytes), which weakens tamper detection.
const AUTH_TAG_LENGTH = 16;
const CURRENT_VERSION = "v1";

/** SHA-256 of the raw env secret, so any non-empty string is a valid key. */
function getKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY is not set — required to encrypt/decrypt platform secret settings."
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== CURRENT_VERSION) {
    throw new Error("Unrecognized secret envelope format or version.");
  }
  // Array destructuring can't carry the length===4 check above into the
  // element types under noUncheckedIndexedAccess, so these are asserted
  // rather than re-checked — the invariant was just proven above.
  const ivB64 = parts[1]!;
  const authTagB64 = parts[2]!;
  const ciphertextB64 = parts[3]!;
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Whether a stored value looks like a `secret`-type envelope, for guards/tests. */
export function isSecretEnvelope(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${CURRENT_VERSION}:`);
}
