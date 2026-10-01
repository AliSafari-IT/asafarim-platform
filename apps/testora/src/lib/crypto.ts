import crypto from "node:crypto";

// Encryption at rest for values only the server may read: per-app GitHub
// tokens (lib/github.ts) and per-target test secrets (#702). Values are
// decrypted server-side only and are never returned to the browser.

// Same signing/secret convention as src/lib/app-access.ts. Set TESTORA_SECRET in
// production; the dev fallback is fine locally but must not protect real tokens.
const SECRET = process.env.TESTORA_SECRET || "testora-insecure-dev-secret-change-me";

// A stable 32-byte key derived from the secret for AES-256-GCM.
const KEY = crypto.scryptSync(SECRET, "testora-github-token", 32);

// ── Token encryption (AES-256-GCM) ───────────────────────────────────────────

/** Encrypt a secret for storage: `gcm$iv$tag$ciphertext` (all hex). */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm$${iv.toString("hex")}$${tag.toString("hex")}$${enc.toString("hex")}`;
}

/** Decrypt a stored secret; returns null if the value is malformed or tampered. */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [scheme, ivHex, tagHex, dataHex] = stored.split("$");
  if (scheme !== "gcm" || !ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"), {
      authTagLength: 16,
    });
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
