import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Network policy for run targets (#699) — which URLs Testora's browser and
 * `t.request` may be pointed at.
 *
 * Always:
 *   - only http(s), and no userinfo (`https://user:pass@host`);
 *   - a raw (not stored) URL is admin/superadmin-only. Testers run against a
 *     stored target_environments row, by `targetId`.
 * In production (NODE_ENV=production, or TESTORA_TARGET_POLICY=strict):
 *   - no single-label hostnames (docker service names like `testora-postgres`),
 *     `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`;
 *   - the hostname is resolved and EVERY address must be public: private,
 *     loopback, link-local (incl. the 169.254.169.254 metadata service), CGNAT,
 *     unspecified (0.0.0.0 / ::), multicast, reserved and documentation ranges
 *     are all refused, for IPv4, IPv6 and IPv4-mapped/NAT64 IPv6.
 * In local dev the network rules are off, so Local targets (localhost) work.
 *
 * This is an app-layer check; it cannot stop DNS rebinding between this check
 * and the browser's own lookup. The run pipeline re-checks right before each
 * fixture to narrow that window; the network-level backstop is tracked
 * separately (see the PR for #699).
 */

export type TargetPolicyCode =
  | "INVALID_TARGET_URL"
  | "TARGET_SCHEME_NOT_ALLOWED"
  | "TARGET_USERINFO_NOT_ALLOWED"
  | "RAW_TARGET_ADMIN_ONLY"
  | "TARGET_HOST_NOT_ALLOWED"
  | "TARGET_ADDRESS_NOT_ALLOWED"
  | "TARGET_UNRESOLVABLE";

export class TargetPolicyError extends Error {
  readonly code: TargetPolicyCode;
  readonly status: 400 | 403;
  constructor(code: TargetPolicyCode, message: string, status: 400 | 403 = 403) {
    super(message);
    this.name = "TargetPolicyError";
    this.code = code;
    this.status = status;
  }
}

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface TargetPolicyOptions {
  /** admin/superadmin — may use a raw URL instead of a stored target. */
  isAdmin: boolean;
  /** The URL comes from a stored target / project / fixture row. */
  stored?: boolean;
  /** Apply the network rules. Defaults to isStrictTargetPolicy(). */
  production?: boolean;
  /** DNS resolver (injectable for tests). */
  lookup?: LookupFn;
  /** Give up on DNS after this long (treated as unresolvable). Default 3s. */
  lookupTimeoutMs?: number;
}

const DEFAULT_LOOKUP_TIMEOUT_MS = 3_000;

/** Resolve, but never wait longer than `ms` — a slow resolver must not stall a request. */
async function lookupWithTimeout(lookup: LookupFn, hostname: string, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DNS lookup timed out")), ms);
  });
  try {
    return await Promise.race([lookup(hostname), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Whether the network rules apply in this process. */
export function isStrictTargetPolicy(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.TESTORA_TARGET_POLICY === "strict";
}

// ── IPv4 ───────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** [network, prefix length, label] — every range a target may not resolve into. */
const BLOCKED_V4: [string, number, string][] = [
  ["0.0.0.0", 8, "unspecified / 'this network'"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "carrier-grade NAT"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link-local / cloud metadata"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "IETF protocol assignments"],
  ["192.0.2.0", 24, "documentation"],
  ["192.88.99.0", 24, "6to4 relay"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmarking"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved / broadcast"],
];

function blockedV4Reason(ip: string): string | null {
  const value = ipv4ToInt(ip);
  for (const [network, prefix, label] of BLOCKED_V4) {
    const size = 2 ** (32 - prefix);
    const start = ipv4ToInt(network);
    if (value >= start && value < start + size) return label;
  }
  return null;
}

// ── IPv6 ───────────────────────────────────────────────────────────────────

/** Expand an IPv6 address to 8 16-bit groups (handles `::` and a dotted IPv4 tail). */
function ipv6Groups(ip: string): number[] {
  let address = ip.split("%")[0]!.toLowerCase(); // drop a zone id
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[1]!);
    address = address.slice(0, -dotted[1]!.length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const [head, tail] = address.split("::");
  const parse = (part: string | undefined) => (part ? part.split(":").map((g) => parseInt(g, 16)) : []);
  const headGroups = parse(head);
  const tailGroups = parse(tail);
  const fill = tail === undefined ? [] : new Array(8 - headGroups.length - tailGroups.length).fill(0);
  return [...headGroups, ...fill, ...tailGroups];
}

function blockedV6Reason(ip: string): string | null {
  const g = ipv6Groups(ip);
  if (g.length !== 8 || g.some((n) => Number.isNaN(n))) return "unparseable IPv6";
  const embeddedV4 = () => `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
  const zeroPrefix = (count: number) => g.slice(0, count).every((n) => n === 0);

  if (zeroPrefix(8)) return "unspecified (::)";
  if (zeroPrefix(7) && g[7] === 1) return "loopback (::1)";
  // ::ffff:a.b.c.d (IPv4-mapped) — judge by the IPv4 inside.
  if (zeroPrefix(5) && g[5] === 0xffff) {
    const reason = blockedV4Reason(embeddedV4());
    return reason ? `IPv4-mapped ${reason}` : null;
  }
  // ::a.b.c.d (deprecated IPv4-compatible) and the rest of ::/96.
  if (zeroPrefix(6)) return "IPv4-compatible (deprecated)";
  // 64:ff9b::/96 NAT64 — judge by the IPv4 inside.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) {
    const reason = blockedV4Reason(embeddedV4());
    return reason ? `NAT64 ${reason}` : null;
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return "unique local (fc00::/7)";
  if ((g[0]! & 0xffc0) === 0xfe80) return "link-local (fe80::/10)";
  if ((g[0]! & 0xffc0) === 0xfec0) return "site-local (fec0::/10)";
  if ((g[0]! & 0xff00) === 0xff00) return "multicast (ff00::/8)";
  if (g[0] === 0x2001 && g[1] === 0x0db8) return "documentation (2001:db8::/32)";
  if (g[0] === 0x0100 && g.slice(1, 4).every((n) => n === 0)) return "discard-only (100::/64)";
  return null;
}

/** Why an IP address may not be a run target, or null when it's public. */
export function blockedAddressReason(ip: string): string | null {
  const family = isIP(ip);
  if (family === 4) return blockedV4Reason(ip);
  if (family === 6) return blockedV6Reason(ip);
  return "not an IP address";
}

// ── Hostnames ──────────────────────────────────────────────────────────────

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"];

/** Why a (non-IP) hostname may not be a run target, or null. */
export function blockedHostnameReason(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return "empty hostname";
  if (host === "localhost") return "localhost";
  if (!host.includes(".")) return "single-label (internal) hostname";
  const suffix = BLOCKED_SUFFIXES.find((s) => host.endsWith(s));
  if (suffix) return `internal domain (*${suffix})`;
  return null;
}

// ── The policy ─────────────────────────────────────────────────────────────

/**
 * Throw a TargetPolicyError unless `rawUrl` may be a run target; returns the
 * parsed URL. Async because, in production, the hostname is resolved.
 */
export async function assertRunnableTarget(rawUrl: string, options: TargetPolicyOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TargetPolicyError("INVALID_TARGET_URL", `Not a valid URL: ${rawUrl}`, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TargetPolicyError(
      "TARGET_SCHEME_NOT_ALLOWED",
      `Only http:// and https:// targets are allowed (got ${url.protocol}).`,
      400,
    );
  }
  if (url.username || url.password) {
    throw new TargetPolicyError(
      "TARGET_USERINFO_NOT_ALLOWED",
      "Target URLs may not contain a username or password — store credentials as target secrets.",
      400,
    );
  }
  if (!options.stored && !options.isAdmin) {
    throw new TargetPolicyError(
      "RAW_TARGET_ADMIN_ONLY",
      "Pick one of this app's saved targets — running against a custom URL is admin-only.",
      403,
    );
  }

  const production = options.production ?? isStrictTargetPolicy();
  if (!production) return url;

  // URL normalises IPv4 shorthands (0x7f.1, 2130706433) to dotted form and
  // wraps IPv6 in brackets.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    const reason = blockedAddressReason(hostname);
    if (reason) {
      throw new TargetPolicyError(
        "TARGET_ADDRESS_NOT_ALLOWED",
        `Target ${url.origin} is not allowed: ${reason} address.`,
      );
    }
    return url;
  }

  const hostReason = blockedHostnameReason(hostname);
  if (hostReason) {
    throw new TargetPolicyError("TARGET_HOST_NOT_ALLOWED", `Target ${url.origin} is not allowed: ${hostReason}.`);
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookupWithTimeout(
      options.lookup ?? defaultLookup,
      hostname,
      options.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS,
    );
  } catch {
    addresses = [];
  }
  if (addresses.length === 0) {
    throw new TargetPolicyError("TARGET_UNRESOLVABLE", `Target ${url.origin} does not resolve to any address.`, 400);
  }
  for (const { address } of addresses) {
    const reason = blockedAddressReason(address);
    if (reason) {
      throw new TargetPolicyError(
        "TARGET_ADDRESS_NOT_ALLOWED",
        `Target ${url.origin} is not allowed: it resolves to a ${reason} address.`,
      );
    }
  }
  return url;
}

/** JSON body for a policy refusal. */
export function targetPolicyErrorBody(error: TargetPolicyError) {
  return { error: error.message, code: error.code };
}
