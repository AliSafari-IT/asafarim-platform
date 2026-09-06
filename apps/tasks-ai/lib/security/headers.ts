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
}

export function contentSecurityPolicy(opts: CspOptions = {}): string {
  const self = "'self'";
  const directives: Record<string, string[]> = {
    "default-src": [self],
    "base-uri": [self],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": [self],
    "script-src": [self, opts.nonce ? `'nonce-${opts.nonce}'` : "'strict-dynamic'"],
    "style-src": [self, "'unsafe-inline'"], // design tokens inject inline vars
    "img-src": [self, "data:", "blob:"],
    "font-src": [self, "data:"],
    "connect-src": [self, ...(opts.connectSrc ?? [])],
    "worker-src": [self],
    "manifest-src": [self],
    "upgrade-insecure-requests": [],
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
    [cspHeader]: contentSecurityPolicy(opts),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
