import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/**
 * Server-only guest identity resolution.
 *
 * IMPORTANT: the raw IP is only ever used in-process here — it must never
 * be returned to the client, logged in full, or stored raw in the
 * database. `hashGuestIp` is what gets persisted (Timeline.guestIdHash).
 */

/**
 * Number of trusted reverse-proxy hops in front of this app (Caddy in
 * production = 1; no proxy in local dev = 0). Only this many entries from
 * the right of X-Forwarded-For are trusted — the rest could be spoofed by
 * the client.
 */
function trustedProxyHops(): number {
  const raw = process.env.TIMELINEAI_TRUSTED_PROXY_HOPS;
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Resolve the real client IP from trusted proxy headers only. Server-side only. */
export async function resolveClientIp(): Promise<string | null> {
  const headerList = await headers();
  const hops = trustedProxyHops();

  if (hops > 0) {
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      // X-Forwarded-For is a client-appended, left-to-right chain; only the
      // last `hops` entries were appended by proxies we trust.
      const chain = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
      const trustedIndex = chain.length - hops;
      if (trustedIndex >= 0 && chain[trustedIndex]) return chain[trustedIndex]!;
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) return realIp;
  }

  // No trusted proxy configured (local dev): there is no reliable client IP
  // available to a Next.js route handler without a proxy in front, so
  // callers get null and guest features degrade to "unknown" bucket rather
  // than trusting a spoofable header.
  return null;
}

/**
 * Deterministic, non-reversible identifier derived from a guest's IP,
 * keyed with a server secret so it cannot be brute-forced back to real IP
 * ranges even if the hash leaks. Never store or return the raw IP.
 */
export function hashGuestIp(ip: string): string {
  const key = process.env.TIMELINEAI_GUEST_IP_HASH_KEY;
  if (!key) {
    throw new Error(
      "TIMELINEAI_GUEST_IP_HASH_KEY is not configured — guest features are unavailable."
    );
  }
  return createHmac("sha256", key).update(ip).digest("hex");
}

/** Convenience: resolve + hash in one call. Returns null if IP is unavailable. */
export async function getGuestIdHash(): Promise<string | null> {
  const ip = await resolveClientIp();
  if (!ip) return null;
  return hashGuestIp(ip);
}
