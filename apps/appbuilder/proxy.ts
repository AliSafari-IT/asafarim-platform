import { NextRequest, NextResponse } from "next/server";
import { createAuthProxy } from "@asafarim/auth/proxy";
import { isManagedAppsDomainHost, parseManagedAppHost } from "@/lib/routing/resolveAppHost";

// Sign-in is centralized on the Hub app (platform SSO) — AppBuilder has no
// local sign-in page of its own.
const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL ||
  process.env.HUB_URL ||
  "http://localhost:3001";

const authProxy = createAuthProxy({
  // "/" stays public (a marketing/overview shell, same convention as Hub's
  // own root) so a signed-out visitor can land on AppBuilder and see a
  // sign-in prompt rather than an immediate bounce. Everything else —
  // /apps, /apps/new, /apps/[appId], /apps/[appId]/preview, and every
  // /api/* route except health — requires an active session.
  publicRoutes: ["/", "/api/health"],
  signInUrl: `${hubUrl}/sign-in`,
});

// M11: a managed-app host (`{slug}.apps.asafarim.com`) has no logical
// relationship to the builder's OWN path-based public-route allowlist above
// (a request to `/` on a managed-app host is a real generated app's home
// page, never AppBuilder's marketing shell) — every path there requires an
// active platform session, unconditionally. The generated app's OWN
// visibility/membership policy (lib/generated-data/runtimeAuth.ts) is a
// SEPARATE, additional gate enforced by the render route itself; this proxy
// only ever decides "is there a session at all", never "may this session
// see this app".
const managedAppAuthProxy = createAuthProxy({ publicRoutes: [], signInUrl: `${hubUrl}/sign-in` });

const PREVIEW_PATH = /^\/apps\/[^/]+\/preview(\/|$)/;

/**
 * M06: the generated-app preview route gets a strict, per-request-nonce CSP
 * — nothing here executes generated JS/HTML, so `script-src` allows only
 * this app's own bundled scripts (via the nonce Next.js itself needs to
 * hydrate), never inline/eval. Layered on top of (not replacing) the
 * platform's shared auth proxy, so this stays a single, appbuilder-specific
 * addition rather than a change to `@asafarim/auth` (used by every app).
 */
export async function proxy(request: NextRequest) {
  // M11: wildcard managed-app routing. The Host header is normalized and
  // validated by lib/routing/resolveAppHost.ts — malformed hosts, ports, and
  // reserved slugs never reach a route handler. Never derives a database
  // identifier from the host directly: only the (already-validated) SLUG is
  // forwarded internally; the render route resolves the app id, and the
  // production release, from persisted `app_domains` rows itself.
  const hostHeader = request.headers.get("host");
  if (isManagedAppsDomainHost(hostHeader)) {
    const match = parseManagedAppHost(hostHeader);
    if (!match) {
      // Reserved name, malformed slug, or a nested sub-subdomain — fail
      // closed with a generic 404 before any app logic runs, never
      // distinguishing which of those it was.
      return new NextResponse("Not found", { status: 404 });
    }

    // API routes under a managed-app host are hit directly by the rendered
    // app's own client-side JS at their ordinary path (e.g.
    // `/api/apps/{appId}/runtime/dashboard`) — never rewritten. Each such
    // route resolves its OWN environment from the request Host independently
    // (lib/generated-data/routeHelpers.ts#resolveEnvironmentForRequest), so
    // this proxy only needs to auth-gate it, not redirect its path.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      if (request.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();
      const authResult = await managedAppAuthProxy(request);
      return authResult.status === 200 ? NextResponse.next() : authResult;
    }

    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = `/managed-app/${match.slug}${request.nextUrl.pathname}`;

    // Auth-gate against the REWRITTEN pathname (never `/`, `/api/health`, or
    // any other path the builder's own publicRoutes allowlist would match)
    // — see managedAppAuthProxy's docstring above.
    const authResult = await managedAppAuthProxy(new NextRequest(rewrittenUrl, request));
    if (authResult.status !== 200) return authResult;

    // `app/managed-app/...` cannot be a Next.js "private folder" (a `_`-
    // prefixed name is silently EXCLUDED from routing entirely — confirmed
    // the hard way), so it inevitably exists as an ordinary, directly
    // navigable path on the builder's OWN domain too. A trusted, freshly-set
    // internal header (never trusting any incoming copy — see the direct-hit
    // guard below, which strips this exact path outright on the builder's
    // own domain regardless) marks this request as having genuinely arrived
    // via the managed-app host rewrite, for the render route's own defense
    // in depth.
    const rewrittenHeaders = new Headers(request.headers);
    rewrittenHeaders.set("x-appbuilder-managed-app-verified", "1");
    return NextResponse.rewrite(rewrittenUrl, { request: { headers: rewrittenHeaders } });
  }

  // Defense in depth: `/managed-app/...` must never be reachable by
  // navigating to it directly on the builder's own domain — only ever via
  // the rewrite above. A direct hit here could only be a client trying to
  // route around the managed-app-host gate (wrong domain, or a stale/forged
  // link), so it fails closed exactly like an unresolved managed-app host
  // would, rather than falling through to the builder's normal auth/routing.
  if (request.nextUrl.pathname.startsWith("/managed-app/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const response = await authProxy(request);

  if (!PREVIEW_PATH.test(request.nextUrl.pathname)) {
    return response;
  }

  // createAuthProxy only ever returns a redirect (302/307, signed-out), a
  // JSON error (401/403, deactivated/forbidden), or NextResponse.next()
  // (200) — see packages/auth/src/proxy.ts. Only the 200 pass-through case
  // is an authorized request that will actually render the preview.
  if (response.status !== 200) {
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join("; ");

  // Next.js reads the nonce for its own framework-injected inline scripts
  // (RSC hydration payloads) from a `'nonce-...'` token in the
  // Content-Security-Policy header it sees on the *request* — see
  // https://nextjs.org/docs/app/guides/content-security-policy.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  // Route the nonce to Server Components too (e.g. the root layout's
  // `<ThemeScript nonce={...} />` — see app/layout.tsx) — the CSP header
  // alone only reaches Next.js's own framework-injected scripts, not our own
  // inline `<script>` tags, which need the matching `nonce` attribute set
  // explicitly.
  requestHeaders.set("x-nonce", nonce);

  const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
  nextResponse.headers.set("Content-Security-Policy", csp);
  return nextResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
