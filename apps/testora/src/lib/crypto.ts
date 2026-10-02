import crypto from "node:crypto";
import { resolveTestoraSecret } from "@/lib/secret-config";

// Encryption at rest for values only the server may read: per-app GitHub
// tokens (lib/github.ts) and per-target test secrets (#702). Values are
// decrypted server-side only and are never returned to the browser.

// The key comes from TESTORA_SECRET. In production a missing, short or
// default secret is refused (lib/secret-config.ts, #726) — fail closed rather
// than protect real secrets with a known key. Derived lazily (on first use),
// so importing this module never throws — e.g. during `next build`.
let derivedKey: Buffer | undefined;
function key(): Buffer {
  // A stable 32-byte key derived from the secret for AES-256-GCM.
  derivedKey ??= crypto.scryptSync(resolveTestoraSecret(), "testora-github-token", 32);
  return derivedKey;
}

// ── Token encryption (AES-256-GCM) ───────────────────────────────────────────

/** Encrypt a secret for storage: `gcm$iv$tag$ciphertext` (all hex). */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm$${iv.toString("hex")}$${tag.toString("hex")}$${enc.toString("hex")}`;
}

/** Decrypt a stored secret; returns null if the value is malformed or tampered. */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [scheme, ivHex, tagHex, dataHex] = stored.split("$");
  if (scheme !== "gcm" || !ivHex || !tagHex || !dataHex) return null;
  // Outside the try: an unusable key in production must throw, not read as
  // "tampered value" (null).
  const k = key();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivHex, "hex"), {
      authTagLength: 16,
    });
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
