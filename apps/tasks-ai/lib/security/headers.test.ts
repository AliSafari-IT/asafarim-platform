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

  it("uses a nonce when given, strict-dynamic otherwise", () => {
    expect(contentSecurityPolicy({ nonce: "abc" })).toContain("'nonce-abc'");
    expect(contentSecurityPolicy()).toContain("'strict-dynamic'");
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
