import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

describe("contentSecurityPolicy", () => {
  it("locks down object-src, frame-ancestors and base-uri", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds only the provider origins passed in to connect-src", () => {
    const csp = contentSecurityPolicy({ connectSrc: ["https://api.anthropic.com"] });
    expect(csp).toMatch(/connect-src 'self' https:\/\/api\.anthropic\.com/);
    expect(csp).not.toContain("api.openai.com");
  });

  it("uses nonce + strict-dynamic when a nonce is given", () => {
    const csp = contentSecurityPolicy({ nonce: "abc" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });

  it("falls back to 'self' 'unsafe-inline' (never bare strict-dynamic) with no nonce", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    // bare strict-dynamic with no nonce disables host allow-listing and
    // blocks every /_next chunk — must never ship.
    expect(csp).not.toContain("'strict-dynamic'");
  });

  it("allows https: images so cross-origin avatars load", () => {
    expect(contentSecurityPolicy()).toContain("img-src 'self' data: blob: https:");
  });

  it("omits the CSP entirely when omitCsp is set", () => {
    const h = securityHeaders({ omitCsp: true });
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["Strict-Transport-Security"]).toBeTruthy();
  });

  it("loosens script-src and drops upgrade-insecure-requests in dev", () => {
    const csp = contentSecurityPolicy({ dev: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:");
    expect(csp).not.toContain("'strict-dynamic'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self' ws: http:");
  });
});

describe("securityHeaders", () => {
  it("sets HSTS, nosniff, DENY, referrer and permissions policy", () => {
    const h = securityHeaders();
    expect(h["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
    expect(h["Content-Security-Policy"]).toBeTruthy();
  });

  it("switches to report-only when asked", () => {
    const h = securityHeaders({ reportOnly: true });
    expect(h["Content-Security-Policy-Report-Only"]).toBeTruthy();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });
});
