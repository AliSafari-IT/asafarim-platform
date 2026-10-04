/**
 * Where a sign-in page sends a person afterwards (#804, #807). `callbackUrl` comes from the query string, so it is
 * untrusted: a check on the RAW string ("starts with /, not //") is not enough, because a browser's
 * URL parser normalises some such values to another origin (a backslash is read as a slash; tabs,
 * newlines and other control characters are dropped). So the decision is made on the RESOLVED URL:
 *
 *   - a raw value with a backslash or a control character is refused outright;
 *   - the value is resolved against the app's own origin and accepted only if the result is that origin
 *     or one of the platform's trusted origins;
 *   - for the app's own origin the RESOLVED path, query and hash are returned (never the raw string), and a
 *     result that would read as protocol-relative (`//host`, which `/.//host` resolves to) is refused;
 *   - the app's sign-in paths (`signInPaths`) map to `fallback` (a signed-in person has no business there);
 *   - anything else, including anything malformed, is `fallback`.
 *
 * The result is a same-origin path (navigate with the router) or an absolute URL on a trusted platform origin
 * (assign it to `location`). It is never a raw query value. One implementation for Hub and Admin; this file is
 * pure (no imports) so it is safe in client components.
 */

/** The longest raw value considered; a real callback is a path and a short query. */
const MAX_LENGTH = 2048;

/** A backslash (browsers read it as `/`) or an ASCII control character (browsers strip tabs and newlines). */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\\u0000-\u001f\u007f]/;

export interface CallbackPolicy {
  /** The app's own origin, e.g. https://hub.asafarim.com */
  selfOrigin: string;
  /** The other platform apps' origins this app may send a person back to. */
  trustedOrigins: ReadonlySet<string>;
  /** Where to go when the value is missing, malformed or refused, e.g. "/dashboard". */
  fallback: string;
  /** Own-origin path prefixes that map to `fallback`, e.g. ["/sign-in", "/sign-up"]. */
  signInPaths: readonly string[];
}

export function createCallbackUrlNormalizer(policy: CallbackPolicy) {
  const { selfOrigin, trustedOrigins, fallback, signInPaths } = policy;
  return function normalizeCallbackUrl(raw: string | null | undefined): string {
    if (!raw || raw.length > MAX_LENGTH || FORBIDDEN.test(raw)) return fallback;
    // Only a path ("/x", never "//x") or an absolute http(s) URL: nothing else is resolved against the app.
    const isPath = raw.startsWith("/") && !raw.startsWith("//");
    if (!isPath && !/^https?:\/\//i.test(raw)) return fallback;

    let url: URL;
    try {
      url = new URL(raw, selfOrigin);
    } catch {
      return fallback;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;

    if (url.origin === selfOrigin) {
      const path = `${url.pathname}${url.search}${url.hash}`;
      if (signInPaths.some((p) => url.pathname.startsWith(p))) return fallback;
      // Dot segments can leave a leading "//" in the resolved path ("/.//host"): that is protocol-relative.
      if (/^\/[\\/]/.test(path)) return fallback;
      return path;
    }
    // Another platform app: the resolved, normalised URL, not the raw string.
    return trustedOrigins.has(url.origin) ? url.href : fallback;
  };
}
