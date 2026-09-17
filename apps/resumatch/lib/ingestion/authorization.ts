/**
 * Whether a source may be fetched at all (JM-025, and the M0 rule it serves).
 *
 * The business plan's non-goals are explicit: no unapproved scraping, and
 * every source recorded in a rights register with an owner, an agreement,
 * and permitted fields. This module is where that stops being a policy
 * document and becomes something the code cannot get around.
 *
 * Everything here is a pure function of a source's own configuration, so
 * the rule is exhaustively testable and is checked in one place rather than
 * remembered at each call site. `runSync` asks this first and makes no
 * network request if the answer is no.
 *
 * Deliberately fails closed on every axis. An absent agreement reference, an
 * absent expiry, an unparseable endpoint — all refusals. A source that has
 * not been deliberately and completely authorised is not authorised.
 */

export type IngestionRefusal =
  | "SYNC_DISABLED"
  | "SOURCE_NOT_ACTIVE"
  | "NO_AGREEMENT_REFERENCE"
  | "NO_AGREEMENT_EXPIRY"
  | "AGREEMENT_EXPIRED"
  | "ENDPOINT_NOT_ALLOWED";

export interface SourceAuthorization {
  status: string;
  syncEnabled: boolean;
  agreementReference: string | null;
  agreementExpiresAt: Date | null;
  endpoint: string;
}

export type AuthorizationResult =
  | { allowed: true }
  | { allowed: false; reasonCode: IngestionRefusal };

/**
 * A refusal, explained for an operator. Codes rather than messages
 * everywhere else, because these strings end up in logs and run records.
 */
export function explainRefusal(code: IngestionRefusal): string {
  switch (code) {
    case "SYNC_DISABLED":
      return "Syncing is switched off for this source.";
    case "SOURCE_NOT_ACTIVE":
      return "The source is not active. Only an ACTIVE source is synced.";
    case "NO_AGREEMENT_REFERENCE":
      return "No agreement reference is recorded. JobMatch does not fetch from a source whose terms are not on file.";
    case "NO_AGREEMENT_EXPIRY":
      return "No agreement expiry is recorded. An agreement without an end date cannot be checked, so it is treated as absent.";
    case "AGREEMENT_EXPIRED":
      return "The recorded agreement has expired. The source stops syncing on its own rather than waiting to be switched off.";
    case "ENDPOINT_NOT_ALLOWED":
      return "The endpoint is not a public HTTPS address, or resolves somewhere requests must not go.";
  }
}

export function authorizeSource(
  source: SourceAuthorization,
  now: Date = new Date(),
): AuthorizationResult {
  if (!source.syncEnabled) return { allowed: false, reasonCode: "SYNC_DISABLED" };
  if (source.status !== "ACTIVE") return { allowed: false, reasonCode: "SOURCE_NOT_ACTIVE" };

  // An agreement reference is the whole point of the rights register: it is
  // the link between a request JobMatch makes and a document a human signed.
  if (!source.agreementReference || source.agreementReference.trim().length === 0) {
    return { allowed: false, reasonCode: "NO_AGREEMENT_REFERENCE" };
  }

  // An open-ended agreement is not treated as permanent permission. Requiring
  // an expiry means every source is re-examined on a known date instead of
  // being fetched forever because nobody revisited it.
  if (!source.agreementExpiresAt) {
    return { allowed: false, reasonCode: "NO_AGREEMENT_EXPIRY" };
  }
  if (source.agreementExpiresAt.getTime() <= now.getTime()) {
    return { allowed: false, reasonCode: "AGREEMENT_EXPIRED" };
  }

  if (!isPublicHttpsUrl(source.endpoint)) {
    return { allowed: false, reasonCode: "ENDPOINT_NOT_ALLOWED" };
  }

  return { allowed: true };
}

/**
 * Hosts that must never be fetched, whatever a source row says (JM-030).
 *
 * A connector endpoint is operator-supplied configuration, which makes it a
 * server-side request forgery vector: point a source at the cloud metadata
 * service and the sync fetches credentials on the attacker's behalf. The
 * literal addresses matter less than the shape of the rule — an outbound
 * request may only go somewhere public.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

/** Private, loopback, link-local and carrier-grade NAT ranges. */
const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function isPublicHttpsUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  // HTTPS only. A feed fetched over plaintext can be rewritten in transit,
  // and job content is fed to a parser and later to a model.
  if (url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (hostname.endsWith(".localhost") || hostname.endsWith(".internal")) return false;

  // IPv6 loopback and unique-local.
  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")) return false;

  if (BLOCKED_IPV4.test(hostname)) return false;

  // A bare hostname with no dot is an internal name on most networks.
  if (!hostname.includes(".") && !hostname.includes(":")) return false;

  return true;
}
