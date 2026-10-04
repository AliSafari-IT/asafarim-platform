/**
 * Where Hub sends a person after sign-in (#804). `callbackUrl` comes from the query string, so it is
 * untrusted: a check on the RAW string ("starts with /, not //") is not enough, because a browser's
 * URL parser normalises some such values to another origin (a backslash is read as a slash; tabs,
 * newlines and other control characters are dropped). So the decision is made on the RESOLVED URL:
 *
 *   - a raw value with a backslash or a control character is refused outright;
 *   - the value is resolved against Hub's own origin and accepted only if the result is Hub's origin
 *     or one of the platform's trusted origins;
 *   - for Hub's own origin the RESOLVED path, query and hash are returned (never the raw string), and a
 *     result that would read as protocol-relative (`//host`, which `/.//host` resolves to) is refused;
 *   - /sign-in and /sign-up map to /dashboard (a signed-in person has no business there);
 *   - anything else, including anything malformed, is /dashboard.
 *
 * `/oidc/continue?ticket=…` is an ordinary same-origin path and passes unchanged: the sign-in hand-off
 * depends on it (#801).
 */
import { getPlatformLinks } from "@asafarim/ui";

export const DEFAULT_CALLBACK = "/dashboard";

/** The longest raw value considered; a real callback is a path and a short query. */
const MAX_LENGTH = 2048;

/** A backslash (browsers read it as `/`) or an ASCII control character (browsers strip tabs and newlines). */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\\u0000-\u001f\u007f]/;

export interface CallbackPolicy {
  /** Hub's own origin, e.g. https://hub.asafarim.com */
  hubOrigin: string;
  /** The other platform apps' origins that Hub may send a person back to. */
  trustedOrigins: ReadonlySet<string>;
}

export function createCallbackUrlNormalizer(policy: CallbackPolicy) {
  return function normalizeCallbackUrl(raw: string | null | undefined): string {
    if (!raw || raw.length > MAX_LENGTH || FORBIDDEN.test(raw))
      return DEFAULT_CALLBACK;
    // Only a path ("/x", never "//x") or an absolute http(s) URL: nothing else is resolved against Hub.
    const isPath = raw.startsWith("/") && !raw.startsWith("//");
    if (!isPath && !/^https?:\/\//i.test(raw)) return DEFAULT_CALLBACK;

    let url: URL;
    try {
      url = new URL(raw, policy.hubOrigin);
    } catch {
      return DEFAULT_CALLBACK;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return DEFAULT_CALLBACK;

    if (url.origin === policy.hubOrigin) {
      const path = `${url.pathname}${url.search}${url.hash}`;
      if (
        url.pathname.startsWith("/sign-in") ||
        url.pathname.startsWith("/sign-up")
      )
        return DEFAULT_CALLBACK;
      // Dot segments can leave a leading "//" in the resolved path ("/.//host"): that is protocol-relative.
      if (/^\/[\\/]/.test(path)) return DEFAULT_CALLBACK;
      return path;
    }
    // Another platform app: the resolved, normalised URL, not the raw string.
    return policy.trustedOrigins.has(url.origin) ? url.href : DEFAULT_CALLBACK;
  };
}

function defaultPolicy(): CallbackPolicy {
  const links = getPlatformLinks();
  return {
    hubOrigin: new URL(links.hub).origin,
    trustedOrigins: new Set(
      [
        links.web,
        links.hub,
        links.showcase,
        links.admin,
        links.vionto,
        links.testora,
        links.appbuilder,
        links.edumatch,
        links.timelineai,
        links.labs,
        links.resumatch,
        links.tasksai,
      ].map((url) => new URL(url).origin)
    ),
  };
}

/** Hub's callback check, with the platform's real origins. The ONE copy: sign-in uses it, and so does the page. */
export const normalizeCallbackUrl =
  createCallbackUrlNormalizer(defaultPolicy());
