/**
 * Per-run secrets and environment for a spec (#702).
 *
 * A spec — and every `{{NAME}}` test-data placeholder — sees ONLY:
 *   1. the run target's secrets (target_secrets, decrypted server-side);
 *   2. the run's own values: TESTORA_* (DOM dir, target URLs, sign-up flag)
 *      and WEBAPP_API_URL, which always win over a secret of the same name;
 *   3. DEPRECATED: for the seeded ASafariM apps only, the server-env
 *      credentials/URLs their scripts were written against, when the target has
 *      no secret of that name. Logged on every run so they can be moved into
 *      target secrets and the fallback deleted.
 * Never the rest of the server's process.env (AUTH_SECRET, DB URLs, API keys).
 *
 * Pure (no DB, no process.env reads unless passed in) so it can be unit-tested.
 */

/** A valid secret name: an env-style identifier. */
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Names a run sets itself; a target secret may not shadow them. */
export function isReservedRunName(name: string): boolean {
  return name.startsWith("TESTORA_") || name === "WEBAPP_API_URL";
}

/** Why a secret name can't be stored, or null when it's fine. */
export function secretNameError(name: string): string | null {
  if (!SECRET_NAME_PATTERN.test(name)) {
    return "Secret names are upper-case letters, digits and underscores, starting with a letter (e.g. ADMIN_PASSWORD).";
  }
  if (isReservedRunName(name)) {
    return "TESTORA_* and WEBAPP_API_URL are set by each run and can't be stored as secrets.";
  }
  return null;
}

/**
 * Server-env names the seeded ASafariM suites read today. Credentials are
 * copied into target secrets by the seed (db/seedDatabase.ts); the rest are
 * non-secret URLs. Kept only as a deprecated fallback for these projects.
 */
export const DEPRECATED_SERVER_ENV_NAMES: Record<string, string[]> = {
  "asafarim-timelineai": [
    "ASAFARIM_ADMIN_EMAIL",
    "ASAFARIM_ADMIN_PASSWORD",
    "ASAFARIM_HUB_URL",
    "NEXT_PUBLIC_ASAFARIM_HUB_URL",
    "ASAFARIM_TIMELINEAI_URL",
    "NEXT_PUBLIC_ASAFARIM_TIMELINEAI_URL",
  ],
  "asafarim-vionto": [
    "ASAFARIM_ADMIN_EMAIL",
    "ASAFARIM_ADMIN_PASSWORD",
    "ASAFARIM_HUB_URL",
    "NEXT_PUBLIC_ASAFARIM_HUB_URL",
    "ASAFARIM_VIONTO_URL",
    "NEXT_PUBLIC_ASAFARIM_VIONTO_URL",
  ],
  "asafarim-edumatch": [
    "EDUMATCH_STUDENT_EMAIL",
    "EDUMATCH_STUDENT_PASSWORD",
    "EDUMATCH_TEACHER_EMAIL",
    "EDUMATCH_TEACHER_PASSWORD",
    "ASAFARIM_EDUMATCH_URL",
  ],
};

/** The credential names the seed copies from server env into each app's target secrets. */
export const SEEDED_CREDENTIAL_NAMES: Record<string, string[]> = Object.fromEntries(
  Object.entries(DEPRECATED_SERVER_ENV_NAMES).map(([projectId, names]) => [
    projectId,
    names.filter((name) => /_(EMAIL|PASSWORD)$/.test(name)),
  ]),
);

export interface RunSpecEnv {
  /** Exactly what the spec's `process.env` (and placeholders) can see. */
  env: Record<string, string>;
  /** Names that came from the deprecated server-env fallback (for the run log). */
  deprecatedFallback: string[];
}

export function buildRunSpecEnv(input: {
  /** The unit's project (decides the deprecated fallback). */
  projectId: string | null | undefined;
  /** Decrypted secrets of the run's target — only when it belongs to this unit's project. */
  targetSecrets: Record<string, string>;
  /** The run's own values (TESTORA_*, WEBAPP_API_URL); undefined entries are dropped. */
  runValues: Record<string, string | undefined>;
  /** Source for the deprecated fallback (normally process.env). */
  serverEnv: Record<string, string | undefined>;
}): RunSpecEnv {
  const env: Record<string, string> = {};
  const deprecatedFallback: string[] = [];

  for (const name of DEPRECATED_SERVER_ENV_NAMES[input.projectId ?? ""] ?? []) {
    const value = input.serverEnv[name];
    if (value !== undefined && !(name in input.targetSecrets)) {
      env[name] = value;
      deprecatedFallback.push(name);
    }
  }
  for (const [name, value] of Object.entries(input.targetSecrets)) {
    if (!isReservedRunName(name)) env[name] = value;
  }
  for (const [name, value] of Object.entries(input.runValues)) {
    if (value !== undefined) env[name] = value;
  }
  return { env, deprecatedFallback };
}
