import { randomBytes } from "node:crypto";
import { isWebTarget } from "@/lib/web-target";
import { getProject } from "@/data/projects";

/**
 * Target ownership (#703). Running login/form automation from the VPS against
 * a site nobody here owns is an abuse and reputation risk, so a non-ASafariM
 * app's targets only become runnable once its operator proves control of the
 * app's host:
 *   - https://<host>/.well-known/testora-verification containing the record, or
 *   - a DNS TXT record "testora-verification=<token>" on <host> or on
 *     _testora-verification.<host>.
 * The proof covers the app's host and its subdomains. Seeded ASafariM apps are
 * pre-verified for their registrable domain (asafarim.com). Local targets
 * (localhost) never need proof — they aren't reachable from the VPS anyway.
 *
 * Pure apart from the token generator; the network checks take injected
 * fetch/DNS functions.
 */

export const WELL_KNOWN_PATH = "/.well-known/testora-verification";
export const TXT_PREFIX = "_testora-verification";

export interface OwnershipProject {
  id: string;
  seeded: boolean;
  baseUrl: string;
  verifiedAt: Date | string | null;
}

export function newVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

/** The exact record the operator publishes. */
export function verificationRecord(token: string): string {
  return `testora-verification=${token}`;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** Naive registrable domain: the last two labels (asafarim.com). */
function registrableDomain(host: string): string {
  return host.split(".").slice(-2).join(".");
}

/**
 * The domain a built-in app is pre-verified for — from the CODE registry
 * (data/projects.ts), never from the editable baseUrl, so editing a built-in
 * app's URL can't carry the exemption to someone else's site.
 */
export function builtInDomain(projectId: string): string | null {
  const host = hostOf(getProject(projectId)?.baseUrl);
  return host ? registrableDomain(host) : null;
}

/** The domain a project may run against, or null when it isn't verified. */
export function ownedDomain(project: OwnershipProject): string | null {
  if (project.seeded) return builtInDomain(project.id);
  const host = hostOf(project.baseUrl);
  if (!host) return null;
  return project.verifiedAt ? host : null;
}

/** Why a built-in app may not move to `baseUrl`, or null. */
export function builtInUrlChangeError(projectId: string, baseUrl: string): string | null {
  const host = hostOf(baseUrl);
  const domain = builtInDomain(projectId);
  if (!baseUrl || !host || !domain || hostWithin(host, domain)) return null;
  return `Built-in apps can only point at ${domain} or its subdomains — create a new app for ${host}.`;
}

export function hostWithin(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export interface OwnershipRefusal {
  status: 403;
  body: { error: string; code: "OWNERSHIP_UNVERIFIED" | "TARGET_OUTSIDE_VERIFIED_DOMAIN" };
}

/**
 * Null when every (web) URL a run would hit lies within the project's verified
 * domain; otherwise the 403 to return.
 */
export function checkRunOwnership(
  project: OwnershipProject | null | undefined,
  urls: (string | null | undefined)[],
): OwnershipRefusal | null {
  const webHosts = urls
    .filter((url): url is string => Boolean(url) && isWebTarget(url))
    .map(hostOf)
    .filter((host): host is string => host !== null);
  if (webHosts.length === 0) return null;

  const domain = project ? ownedDomain(project) : null;
  if (!domain) {
    return {
      status: 403,
      body: {
        code: "OWNERSHIP_UNVERIFIED",
        error:
          `Verify ownership of ${webHosts[0]} before running tests against it: publish this app's ` +
          `verification token at ${WELL_KNOWN_PATH} or in a DNS TXT record, then press Verify in Apps.`,
      },
    };
  }
  const outside = webHosts.find((host) => !hostWithin(host, domain));
  if (outside) {
    return {
      status: 403,
      body: {
        code: "TARGET_OUTSIDE_VERIFIED_DOMAIN",
        error: `${outside} is outside this app's verified domain (${domain}). Point the target at ${domain} or a subdomain.`,
      },
    };
  }
  return null;
}

export interface ProofDeps {
  /** GET a URL as text (already SSRF-checked, bounded); throws on failure. */
  fetchText: (url: string) => Promise<string>;
  /** DNS TXT lookup; throws/returns [] when there is none. */
  resolveTxt: (hostname: string) => Promise<string[][]>;
}

export interface ProofResult {
  verified: boolean;
  method?: "well-known" | "dns-txt";
  /** Why it failed — for the admin, no secrets in it. */
  detail: string;
}

/** Look for the token at the well-known URL, then in DNS TXT. */
export async function checkOwnershipProof(host: string, token: string, deps: ProofDeps): Promise<ProofResult> {
  const record = verificationRecord(token);
  const tried: string[] = [];

  const url = `https://${host}${WELL_KNOWN_PATH}`;
  try {
    const body = await deps.fetchText(url);
    if (body.split(/\s+/).some((part) => part === record || part === token)) {
      return { verified: true, method: "well-known", detail: `Found the token at ${url}.` };
    }
    tried.push(`${url} does not contain the token`);
  } catch (error) {
    tried.push(`${url} could not be read (${error instanceof Error ? error.message : "error"})`);
  }

  for (const name of [`${TXT_PREFIX}.${host}`, host]) {
    try {
      const records = await deps.resolveTxt(name);
      if (records.some((chunks) => chunks.join("").trim() === record)) {
        return { verified: true, method: "dns-txt", detail: `Found the TXT record on ${name}.` };
      }
      tried.push(`no matching TXT record on ${name}`);
    } catch {
      tried.push(`no TXT records on ${name}`);
    }
  }
  return { verified: false, detail: `Not verified: ${tried.join("; ")}.` };
}
