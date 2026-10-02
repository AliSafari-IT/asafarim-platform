/**
 * TESTORA_SECRET (#726). Since #702/#711 and #716/#724 it is the AES-GCM key
 * material for target secrets, GitHub tokens and frozen run jobs — so in
 * production Testora must FAIL CLOSED: refuse to boot (src/instrumentation.ts)
 * and refuse to encrypt/decrypt (lib/crypto.ts) when the key is missing, too
 * short or the dev default. Local dev keeps the default so `pnpm dev` works.
 *
 * Pure (env passed in) so it can be unit-tested.
 */

/** The dev-only fallback. Never valid in production. */
export const DEV_TESTORA_SECRET = "testora-insecure-dev-secret-change-me";
export const MIN_TESTORA_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** Why this env's TESTORA_SECRET can't be used, or null when it's fine. */
export function testoraSecretProblem(env: Env = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  const secret = env.TESTORA_SECRET;
  if (!secret) return "TESTORA_SECRET is not set";
  if (secret === DEV_TESTORA_SECRET) return "TESTORA_SECRET is the insecure dev default";
  if (secret.length < MIN_TESTORA_SECRET_LENGTH) {
    return `TESTORA_SECRET is shorter than ${MIN_TESTORA_SECRET_LENGTH} characters`;
  }
  return null;
}

/** The secret to derive keys from; throws in production when it's unusable. */
export function resolveTestoraSecret(env: Env = process.env): string {
  const problem = testoraSecretProblem(env);
  if (problem) {
    throw new Error(`${problem} — refusing to encrypt or decrypt secrets in production (#726).`);
  }
  return env.TESTORA_SECRET || DEV_TESTORA_SECRET;
}
