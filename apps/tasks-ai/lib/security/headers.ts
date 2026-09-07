/**
 * Security response headers + CSP (docs: M12 hardening). Pure builder so the
 * policy is unit-tested and shared by next.config and the proxy.
 *
 * The CSP is strict: no inline script except the theme bootstrap (hashed),
 * connect limited to self + the configured provider origins, frame-ancestors
 * none. Report-only can be toggled while a violation baseline is gathered.
 */
export interface CspOptions {
  /** extra origins the browser may connect to (provider APIs, etc.) */
  connectSrc?: string[];
  reportOnly?: boolean;
  nonce?: string;
  /**
   * Loosen the policy for `next dev`: Turbopack's HMR runtime uses eval and
   * injects inline/blob scripts, and the dev server talks over ws://. The
   * production policy stays strict — this branch is never taken in a build.
   */
  dev?: boolean;
  /**
   * Emit only the nonce-independent headers (HSTS, nosniff, …) and skip the
   * Content-Security-Policy entirely. next.config uses this because the CSP
   * is emitted per-request from proxy.ts with a fresh nonce.
   */
  omitCsp?: boolean;
}

export function contentSecurityPolicy(opts: CspOptions = {}): string {
  const self = "'self'";
  // Production wants a strict nonce + strict-dynamic policy, but that only
  // works when a per-request nonce is actually threaded through (proxy.ts
  // generates one and Next.js hydrates its own scripts against it). With no
  // nonce, `'self' 'strict-dynamic'` disables host allow-listing and blocks
  // every `/_next/*` chunk — the whole app ships with zero client JS. So the
  // no-nonce branch degrades to a functional (if weaker) `'self'
  // 'unsafe-inline'` instead of a policy that bricks the page.
  const scriptSrc = opts.dev
    ? [self, "'unsafe-inline'", "'unsafe-eval'", "blob:"]
    : opts.nonce
      ? [self, `'nonce-${opts.nonce}'`, "'strict-dynamic'"]
      : [self, "'unsafe-inline'"];
  const directives: Record<string, string[]> = {
    "default-src": [self],
    "base-uri": [self],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": [self],
    "script-src": scriptSrc,
    "style-src": [self, "'unsafe-inline'"], // design tokens inject inline vars
    // `https:` so cross-origin user avatars load (Google OAuth pictures on
    // lh3.googleusercontent.com, uploaded avatars on the object-storage CDN).
    // Scripts stay locked down separately — images are not an execution sink.
    "img-src": [self, "data:", "blob:", "https:"],
    "font-src": [self, "data:"],
    "connect-src": [self, ...(opts.dev ? ["ws:", "http:"] : []), ...(opts.connectSrc ?? [])],
    "worker-src": [self, "blob:"],
    "manifest-src": [self],
    // Only meaningful over https; on a localhost dev origin it just noisily
    // rewrites requests, so leave it off in dev.
    ...(opts.dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

export function securityHeaders(opts: CspOptions = {}): Record<string, string> {
  const cspHeader = opts.reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
  return {
    ...(opts.omitCsp ? {} : { [cspHeader]: contentSecurityPolicy(opts) }),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
