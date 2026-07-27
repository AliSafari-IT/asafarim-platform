import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appDomains } from "../db/schema";

/**
 * M11: the ONE place an incoming HTTP `Host` header is turned into "which
 * app, if any, does this request belong to". Every check here is
 * deliberately fail-closed — a host that doesn't parse cleanly, or doesn't
 * resolve to a persisted, ACTIVE `app_domains` row, is treated exactly like
 * an unknown app. Nothing here ever derives a database identifier directly
 * from the untrusted host string; the host is only ever used as an exact
 * equality lookup key after normalization.
 *
 * See middleware.ts (the only caller that reads a raw request Host) and
 * docs/appbuilder-m11-releases-deployment.md#routing-and-tls-architecture.
 */

/** First-party platform subdomains a managed app must never be able to shadow. */
export const RESERVED_APP_SLUGS: ReadonlySet<string> = new Set([
  // Issue-mandated infrastructure/system terms.
  "www",
  "api",
  "admin",
  "appbuilder",
  "preview",
  "auth",
  "hub",
  "status",
  "mail",
  "support",
  // Other first-party subdomains already live on asafarim.com (see
  // infra/caddy/Caddyfile) — a managed app must never be able to shadow an
  // existing platform service either.
  "showcase",
  "vionto",
  "testora",
  "asafarim",
]);

const DEFAULT_MANAGED_APPS_DOMAIN = "apps.asafarim.com";

export function managedAppsBaseDomain(): string {
  return process.env.APPBUILDER_MANAGED_APPS_DOMAIN?.trim().toLowerCase() || DEFAULT_MANAGED_APPS_DOMAIN;
}

// A legal DNS label: 1-63 chars, alphanumeric, hyphens only in the middle —
// deliberately ASCII-only. Any host containing punycode (`xn--`) or a
// character outside this set is rejected rather than "normalized", since
// IDNA normalization has known visual-confusable/ambiguity pitfalls and this
// routing layer has no legitimate need to support non-ASCII hosts at all.
const DNS_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOST_LENGTH = 253;

export interface NormalizedHost {
  host: string;
}

/**
 * Strips a port suffix, lowercases, and validates the result is a
 * well-formed, ASCII-only DNS hostname. Returns `null` (never throws) for
 * anything malformed — ports, IP literals, empty/oversized labels, and any
 * non-ASCII or punycode content are all rejected outright rather than
 * "cleaned up", since a routing layer must fail closed on ambiguity.
 */
export function normalizeHost(rawHost: string | null | undefined): NormalizedHost | null {
  if (!rawHost) return null;
  // A bracketed IPv6 literal (`[::1]:3000`) is rejected by the label check
  // below regardless, but strip a trailing `:port` for the common case first.
  // `Host` headers never legitimately carry a scheme or path — reject those
  // outright rather than attempting to parse them.
  if (rawHost.includes("://") || rawHost.includes("/")) return null;

  const withoutPort = rawHost.includes(":") ? rawHost.slice(0, rawHost.lastIndexOf(":")) : rawHost;
  const host = withoutPort.trim().toLowerCase();

  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return null;
  // Reject punycode/ASCII-compatible-encoding labels outright — this routing
  // layer only ever needs to match plain-ASCII platform-issued slugs, so
  // there is no legitimate `xn--` host to support.
  if (host.includes("xn--")) return null;
  // Reject anything that isn't plain ASCII (catches raw Unicode hosts a
  // client could send without ever going through IDNA encoding).
  if (!/^[\x00-\x7f]*$/.test(host)) return null;

  const labels = host.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => DNS_LABEL_RE.test(label))) return null;
  // An all-numeric final label means this is an IPv4 literal, not a domain
  // name — reject outright (a managed app is never reached by raw IP).
  if (/^\d+$/.test(labels[labels.length - 1])) return null;

  return { host };
}

/**
 * True whenever a (normalizable) host is under the managed-apps domain at
 * all, regardless of whether its slug is actually valid/reserved. Used by
 * proxy.ts to distinguish "this is apps.asafarim.com space, and any
 * malformed/reserved slug here must fail closed with a generic 404" from
 * "this isn't a managed-app host at all, fall through to normal routing" —
 * `parseManagedAppHost` alone can't make that distinction since it returns
 * `null` for both cases.
 */
export function isManagedAppsDomainHost(rawHost: string | null | undefined, baseDomain: string = managedAppsBaseDomain()): boolean {
  const normalized = normalizeHost(rawHost);
  return normalized ? normalized.host.endsWith(`.${baseDomain}`) : false;
}

export interface ManagedAppHostMatch {
  slug: string;
  host: string;
}

/**
 * Recognizes `{slug}.{baseDomain}` and validates the slug isn't reserved.
 * Returns `null` for anything that isn't a direct one-label child of the
 * managed-apps base domain (so `foo.bar.apps.asafarim.com` is rejected, not
 * "resolved to app foo" — a managed app is never nested).
 */
export function parseManagedAppHost(rawHost: string | null | undefined, baseDomain: string = managedAppsBaseDomain()): ManagedAppHostMatch | null {
  const normalized = normalizeHost(rawHost);
  if (!normalized) return null;
  const { host } = normalized;

  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, host.length - suffix.length);
  if (slug.length === 0 || slug.includes(".")) return null;
  if (!DNS_LABEL_RE.test(slug)) return null;
  if (RESERVED_APP_SLUGS.has(slug)) return null;

  return { slug, host };
}

export interface ResolvedManagedAppDomain {
  appId: string;
  domainId: string;
  /** The normalized, persisted host this domain actually resolved on — safe to use as a trusted `Origin` allowlist value (never the raw, unvalidated request header). */
  host: string;
  activeReleaseId: string | null;
}

/**
 * The authoritative host → app resolution. Never leaks WHY a host failed to
 * resolve (reserved slug, malformed host, unknown slug, and a slug that's
 * merely `reserved`/`released` but not yet `active` all return the same
 * `null`) — that ambiguity is deliberate; see this module's docstring.
 */
export async function resolveActiveDomainForHost(db: Db, rawHost: string | null | undefined): Promise<ResolvedManagedAppDomain | null> {
  const match = parseManagedAppHost(rawHost);
  if (!match) return null;

  const [domain] = await db
    .select({ id: appDomains.id, appId: appDomains.appId, host: appDomains.host, activeReleaseId: appDomains.activeReleaseId })
    .from(appDomains)
    .where(and(eq(appDomains.host, match.host), eq(appDomains.status, "active")))
    .limit(1);
  if (!domain) return null;

  return { appId: domain.appId, domainId: domain.id, host: domain.host, activeReleaseId: domain.activeReleaseId };
}
