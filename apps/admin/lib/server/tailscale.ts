import "server-only";

/**
 * Read-only Tailscale device inventory for the Admin console's Devices page.
 *
 * Uses the Tailscale API (https://tailscale.com/kb/1101/api) to list every
 * device on the tailnet — the same list the Tailscale admin console shows at
 * console.tailscale.com/admin/machines. Auth is a Bearer API access token
 * (or an OAuth client secret with `devices:core:read` scope); either works
 * against this endpoint the same way.
 *
 * Env vars (set in apps/admin/.env, never committed):
 *   TAILSCALE_API_KEY  — API access token (tskey-api-...) or OAuth client
 *                         secret. Create one at
 *                         https://login.tailscale.com/admin/settings/keys
 *   TAILSCALE_TAILNET  — tailnet name, e.g. "example.com" or the org's
 *                         alias. Use "-" to mean "the tailnet the key
 *                         belongs to" if unsure.
 */

export type TailscaleDevicesResult =
  | { state: "ok"; devices: TailscaleDevice[] }
  | { state: "not_configured" }
  | { state: "error"; message: string };

export interface TailscaleDevice {
  id: string;
  hostname: string;
  name: string;
  addresses: string[];
  os: string;
  user: string;
  authorized: boolean;
  isExternal: boolean;
  online: boolean;
  lastSeen: string | null;
  created: string | null;
  expires: string | null;
  keyExpiryDisabled: boolean;
  clientVersion: string;
  updateAvailable: boolean;
  tags: string[];
}

// Tailscale reports devices as "offline" purely by how long ago they last
// reported in — there's no live socket. 5 minutes matches the console's own
// online/offline cutoff closely enough for an at-a-glance list.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

interface RawDevice {
  id: string;
  hostname: string;
  name: string;
  addresses?: string[];
  os: string;
  user: string;
  authorized: boolean;
  isExternal?: boolean;
  lastSeen?: string;
  created?: string;
  expires?: string;
  keyExpiryDisabled?: boolean;
  clientVersion?: string;
  updateAvailable?: boolean;
  tags?: string[];
}

export async function getTailnetDevices(): Promise<TailscaleDevicesResult> {
  const apiKey = process.env.TAILSCALE_API_KEY;
  const tailnet = process.env.TAILSCALE_TAILNET;

  if (!apiKey || !tailnet) {
    return { state: "not_configured" };
  }

  try {
    const res = await fetch(
      `https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(tailnet)}/devices?fields=all`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        // Device state changes constantly; never cache across requests.
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        state: "error",
        message: `Tailscale API returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    const json = (await res.json()) as { devices?: RawDevice[] };
    const now = Date.now();

    const devices: TailscaleDevice[] = (json.devices ?? [])
      .map((d) => ({
        id: d.id,
        hostname: d.hostname,
        name: d.name,
        addresses: d.addresses ?? [],
        os: d.os,
        user: d.user,
        authorized: d.authorized,
        isExternal: d.isExternal ?? false,
        online: d.lastSeen
          ? now - new Date(d.lastSeen).getTime() < ONLINE_WINDOW_MS
          : false,
        lastSeen: d.lastSeen ?? null,
        created: d.created ?? null,
        expires: d.expires ?? null,
        keyExpiryDisabled: d.keyExpiryDisabled ?? false,
        clientVersion: d.clientVersion ?? "",
        updateAvailable: d.updateAvailable ?? false,
        tags: d.tags ?? [],
      }))
      .sort((a, b) => a.hostname.localeCompare(b.hostname));

    return { state: "ok", devices };
  } catch (err) {
    return {
      state: "error",
      message: err instanceof Error ? err.message : "Unknown error reaching Tailscale API",
    };
  }
}
