/**
 * Read-only client for Admin's internal platform-settings API.
 *
 * For apps on their own isolated database (Testora, AppBuilder, ResuMatch),
 * which can't query `PlatformSetting` in-process the way web/hub/vionto/etc.
 * do through `@asafarim/db`. Deliberately dependency-free: importing
 * `@asafarim/db` here would pull the platform Prisma client into exactly the
 * apps that run isolated to avoid platform-schema coupling.
 *
 * Semantics — "trust the env var until an admin overrides it":
 * `getSetting(key, fallback)` returns the admin's value only when one has
 * been set (`overridden`). Otherwise it returns the caller's fallback — the
 * app's existing env var or hardcoded default — never the console's catalog
 * default, so adopting this client changes nothing until an admin acts.
 * Any failure (settings API down, timeout, bad credential, type mismatch)
 * also degrades to the last good value, then to the fallback. It never
 * throws.
 *
 * Secrets are never available through this client: the API returns only
 * `isSet` for them. Isolated apps keep reading secrets from env vars — see
 * docs/admin-settings-api.md for the trust boundary.
 */

export const SETTINGS_API_PATH = "/api/internal/settings";

export type WireSettingValue =
  | boolean
  | string
  | number
  | string[]
  | { [key: string]: unknown }
  | unknown[];

/** A non-secret setting: its effective value, and whether an admin set it. */
export interface WirePlainSetting {
  key: string;
  scope: string;
  type: string;
  overridden: boolean;
  value: WireSettingValue;
}

/** A secret setting: presence only. There is no `value` field, ever. */
export interface WireSecretSetting {
  key: string;
  scope: string;
  type: "secret";
  overridden: boolean;
  isSet: boolean;
}

export type WireSetting = WirePlainSetting | WireSecretSetting;

export interface SettingsWireResponse {
  /** The scope that was requested; the response also includes "platform". */
  scope: string | null;
  settings: WireSetting[];
}

export interface SettingsClientOptions {
  /** Admin's base URL, e.g. process.env.NEXT_PUBLIC_ADMIN_URL. */
  baseUrl: string;
  /** The shared INTERNAL_API_SECRET bearer. Without it, every read falls back. */
  secret: string | undefined;
  /** This app's scope key from the platform app registry, e.g. "resumatch". */
  scope: string;
  /** How long a fetched snapshot is reused. Default 60s. */
  ttlMs?: number;
  /** Per-request timeout. Default 3s — a slow settings API must not stall callers. */
  timeoutMs?: number;
  /** Injected for tests. */
  fetch?: typeof fetch;
  now?: () => number;
  /** Called on a failed refresh (for logging); never with secret material. */
  onError?: (error: unknown) => void;
}

export interface SettingsClient {
  getSetting<T extends WireSettingValue>(key: string, fallback: T): Promise<T>;
}

function sameShape(value: WireSettingValue, fallback: WireSettingValue): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback !== null && typeof fallback === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === typeof fallback;
}

export function createSettingsClient(options: SettingsClientOptions): SettingsClient {
  const ttlMs = options.ttlMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  let snapshot: Map<string, WireSetting> | null = null;
  let fetchedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    if (!options.secret) throw new Error("INTERNAL_API_SECRET is not set");
    const url = new URL(SETTINGS_API_PATH, options.baseUrl);
    url.searchParams.set("scope", options.scope);
    const response = await doFetch(url, {
      headers: { authorization: `Bearer ${options.secret}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`settings API responded ${response.status}`);
    const body = (await response.json()) as SettingsWireResponse;
    if (!body || !Array.isArray(body.settings)) throw new Error("malformed settings response");
    snapshot = new Map(body.settings.map((setting) => [setting.key, setting]));
    fetchedAt = now();
  }

  async function ensureFresh(): Promise<void> {
    if (now() - fetchedAt < ttlMs) return;
    // One refresh at a time; concurrent callers share it.
    inflight ??= refresh()
      .catch((error: unknown) => {
        // Keep serving the last good snapshot (if any), and back off for a
        // full TTL so a down API isn't hammered on every call.
        fetchedAt = now();
        options.onError?.(error);
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
  }

  return {
    async getSetting<T extends WireSettingValue>(key: string, fallback: T): Promise<T> {
      await ensureFresh();
      const setting = snapshot?.get(key);
      if (!setting || !setting.overridden || !("value" in setting)) return fallback;
      return sameShape(setting.value, fallback) ? (setting.value as T) : fallback;
    },
  };
}
