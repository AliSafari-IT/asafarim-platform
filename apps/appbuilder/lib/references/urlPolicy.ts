import { lookup } from "node:dns/promises";
import { ReferenceUrlNotAllowedError } from "./errors";
import { REFERENCE_LIMITS } from "./limits";

/**
 * M13 slice F — the SSRF boundary for public reference imports.
 *
 * The threat this module exists for: the user supplies the URL, so a request
 * made on their behalf is a request an attacker chooses the destination of.
 * Left unguarded that reaches the cloud metadata endpoint
 * (169.254.169.254), the Docker/Kubernetes API, the platform's own Postgres
 * and Redis instances on the compose network, `localhost` admin endpoints,
 * and every other service that trusts its network position instead of
 * authenticating. So the policy is an ALLOWLIST of shapes, applied in layers:
 *
 * 1. **Scheme.** `https` only. Not http (plaintext, and a downgrade is how a
 *    redirect chain escapes TLS), not `file:`/`gopher:`/`data:`/`blob:`.
 * 2. **No embedded credentials, no non-standard port.** A URL with a
 *    username/password is trying to authenticate somewhere on our behalf;
 *    a port other than 443 is almost always an internal service.
 * 3. **Host shape.** IP literals are classified and every non-public class
 *    is refused. Names must be multi-label with a plausible TLD — a
 *    single-label host (`postgres`, `redis`, `appbuilder-web`) is a container
 *    or LAN name, never a public site — and internal suffixes
 *    (`.internal`, `.local`, `.localhost`, …) are refused outright.
 * 4. **Resolved addresses.** The name is resolved and EVERY returned address
 *    must be public. Checking only the first answer is the classic
 *    DNS-rebinding hole: a hostile name can answer with one public address
 *    and one loopback address and win whichever the connection picks.
 *
 * A residual TOCTOU gap is documented rather than pretended away: Node's
 * `fetch` re-resolves the name itself, so a name whose answer changes
 * between our check and the connection can still be connected to. Closing
 * that fully requires pinning the checked address into the connection (a
 * custom undici dispatcher/`lookup`), which is deliberately deferred to
 * slice G's hardening pass — the checks here plus the per-hop re-validation
 * in fetchReference.ts stop every static and redirect-based variant, and the
 * response is bounded, type-restricted, and never echoed back with headers.
 */

export type AddressClass =
  | "public"
  | "loopback"
  | "private"
  | "link_local"
  | "unique_local"
  | "cgnat"
  | "multicast"
  | "reserved"
  | "unspecified"
  | "invalid";

/** Hostname suffixes that are internal by definition — a public site never lives at one. */
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  "localhost",
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".corp",
  ".home",
  ".home.arpa",
  ".in-addr.arpa",
  ".ip6.arpa",
  ".test",
  ".invalid",
  ".example",
  ".onion",
];

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function parseHexGroups(segment: string): number[] | null {
  if (segment === "") return [];
  const groups: number[] = [];
  for (const raw of segment.split(":")) {
    if (!/^[0-9a-f]{1,4}$/.test(raw)) return null;
    groups.push(Number.parseInt(raw, 16));
  }
  return groups;
}

/**
 * Expands an IPv6 literal into exactly 8 16-bit groups, handling `::`
 * compression and a trailing embedded IPv4 (`::ffff:127.0.0.1`). The IPv4
 * tail is rewritten to hex first so a single parser covers every form —
 * without that, `::ffff:169.254.169.254` and `::ffff:a9fe:a9fe` would take
 * different code paths to the same metadata endpoint.
 */
function parseIpv6(address: string): number[] | null {
  let text = address.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  // A zone index (`%eth0`) is never meaningful for a remote host.
  if (text.includes("%")) return null;
  if (!text.includes(":")) return null;

  const ipv4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail[1]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, ipv4Tail.index)}${high}:${low}`;
  } else if (text.includes(".")) {
    return null;
  }

  const doubleColon = text.indexOf("::");
  if (doubleColon !== -1 && text.indexOf("::", doubleColon + 1) !== -1) return null;

  if (doubleColon === -1) {
    const groups = parseHexGroups(text);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseHexGroups(text.slice(0, doubleColon));
  const tail = parseHexGroups(text.slice(doubleColon + 2));
  if (!head || !tail) return null;
  // `::` must stand for at least one omitted group.
  if (head.length + tail.length > 7) return null;
  return [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
}

function classifyIpv4(octets: number[]): AddressClass {
  const [a, b] = octets;
  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 169 && b === 254) return "link_local";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a >= 224 && a <= 239) return "multicast";
  if (a === 192 && b === 0) return "reserved"; // 192.0.0.0/24 + 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return "reserved"; // benchmarking
  if (a === 198 && b === 51) return "reserved"; // TEST-NET-2
  if (a === 203 && b === 0) return "reserved"; // TEST-NET-3
  if (a >= 240) return "reserved"; // 240.0.0.0/4 + broadcast
  return "public";
}

/**
 * Classifies an IP literal. Anything not confidently `public` is treated as
 * unroutable-for-us and refused by `assertPublicAddress` — including
 * `invalid`, because a string we cannot parse is a string we cannot vouch
 * for.
 */
export function classifyIpAddress(address: string): AddressClass {
  const ipv4 = parseIpv4(address);
  if (ipv4) return classifyIpv4(ipv4);

  const groups = parseIpv6(address);
  if (!groups) return "invalid";

  // `::` and `::1` are checked before the IPv4-mapping rule below, which
  // would otherwise read `::1` as the IPv4 address 0.0.0.1.
  if (groups.every((group) => group === 0)) return "unspecified";
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return "loopback";

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) addresses are
  // just an IPv4 address wearing a hat — 169.254.169.254 reached as
  // ::ffff:a9fe:a9fe is the same metadata endpoint.
  const allZeroHigh = groups.slice(0, 5).every((group) => group === 0);
  if (allZeroHigh && (groups[5] === 0xffff || groups[5] === 0)) {
    const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    return classifyIpv4(embedded);
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return "unique_local"; // fc00::/7
  if ((groups[0] & 0xffc0) === 0xfe80) return "link_local"; // fe80::/10
  if ((groups[0] & 0xff00) === 0xff00) return "multicast"; // ff00::/8
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return "reserved"; // documentation
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return "reserved"; // NAT64 — an IPv4 destination in disguise
  if (groups[0] === 0x2002) return "reserved"; // 6to4, embeds an arbitrary IPv4 destination
  return "public";
}

export function isPublicAddress(address: string): boolean {
  return classifyIpAddress(address) === "public";
}

/** Throws unless the literal address is public. The message never repeats the address back (see errors.ts's docstring). */
export function assertPublicAddress(address: string): void {
  const classification = classifyIpAddress(address);
  if (classification !== "public") {
    throw new ReferenceUrlNotAllowedError(
      "That URL points at a private or internal address, so it cannot be imported. Only public HTTPS pages can be referenced.",
      classification,
    );
  }
}

function isIpLiteral(hostname: string): boolean {
  const unbracketed = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return parseIpv4(unbracketed) !== null || parseIpv6(unbracketed) !== null;
}

/**
 * Validates everything about a URL that can be decided WITHOUT the network:
 * scheme, credentials, port, and host shape. Returns the normalized URL —
 * normalization matters because the cache is keyed on it, and because
 * `new URL()` is what collapses obfuscated IPv4 forms (`https://2130706433`,
 * `https://0x7f.1`) into the dotted quad that `classifyIpAddress` can judge.
 */
export function normalizeReferenceUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed.length > REFERENCE_LIMITS.MAX_URL_LENGTH) {
    throw new ReferenceUrlNotAllowedError("That is not a valid URL to import.", "malformed");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ReferenceUrlNotAllowedError(
      "That is not a valid URL. Paste a full public address starting with https://.",
      "malformed",
    );
  }

  if (url.protocol !== "https:") {
    throw new ReferenceUrlNotAllowedError(
      "Only https:// URLs can be imported.",
      url.protocol.replace(":", "") || "no_scheme",
    );
  }
  if (url.username || url.password) {
    throw new ReferenceUrlNotAllowedError("URLs containing a username or password cannot be imported.", "embedded_credentials");
  }
  // `url.port` is "" when it is the scheme default (443) — anything else is
  // an explicit non-standard port, which for an outbound fetch on a user's
  // behalf is nearly always an internal service.
  if (url.port !== "") {
    throw new ReferenceUrlNotAllowedError("Only the standard HTTPS port can be imported.", "non_standard_port");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) {
    throw new ReferenceUrlNotAllowedError("That URL has no host.", "no_host");
  }

  if (isIpLiteral(hostname)) {
    // A bare IP is allowed only if it is public; there is no legitimate
    // reason to import from a private one, and this is the direct-hit case
    // (https://169.254.169.254/latest/meta-data/).
    assertPublicAddress(hostname.startsWith("[") ? hostname.slice(1, -1) : hostname);
    return url;
  }

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname === suffix || hostname.endsWith(suffix)) {
      throw new ReferenceUrlNotAllowedError(
        "That host is an internal name, so it cannot be imported. Only public HTTPS pages can be referenced.",
        "internal_suffix",
      );
    }
  }

  // Single-label hosts are container/service/LAN names ("postgres",
  // "appbuilder-web", "metadata"), never public sites.
  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) {
    throw new ReferenceUrlNotAllowedError(
      "That host is not a public domain name, so it cannot be imported.",
      "not_a_public_name",
    );
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) {
    throw new ReferenceUrlNotAllowedError(
      "That host is not a public domain name, so it cannot be imported.",
      "not_a_public_name",
    );
  }

  return url;
}

/** Resolves a hostname to every address the OS would consider using. Injectable so tests can model a rebinding/mixed answer without touching real DNS. */
export type HostResolver = (hostname: string) => Promise<string[]>;

export const defaultHostResolver: HostResolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
};

/**
 * Resolves the host and requires EVERY answer to be public.
 *
 * "Every", not "the first": a DNS-rebinding host answers with a mix (one
 * routable address to pass a naive check, one loopback/metadata address for
 * the connection to actually use) and Node picks per-connection. One private
 * answer disqualifies the name.
 *
 * An empty answer set is also a refusal — an unresolvable name has nothing
 * to vouch for, and "it might work later" is not a reason to let the fetch
 * try.
 */
export async function assertPublicHostname(hostname: string, resolveHost: HostResolver = defaultHostResolver): Promise<string[]> {
  if (isIpLiteral(hostname)) {
    const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    assertPublicAddress(literal);
    return [literal];
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new ReferenceUrlNotAllowedError("That host could not be resolved, so nothing was imported.", "dns_failure");
  }

  if (addresses.length === 0) {
    throw new ReferenceUrlNotAllowedError("That host could not be resolved, so nothing was imported.", "dns_empty");
  }
  for (const address of addresses) {
    assertPublicAddress(address);
  }
  return addresses;
}

/** Scheme/host/port/shape checks plus DNS verification — the full pre-connection gate, run once per redirect hop. */
export async function assertImportableUrl(rawUrl: string, resolveHost: HostResolver = defaultHostResolver): Promise<URL> {
  const url = normalizeReferenceUrl(rawUrl);
  await assertPublicHostname(url.hostname, resolveHost);
  return url;
}
