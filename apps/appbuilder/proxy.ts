import { NextResponse, type NextRequest } from "next/server";
import { createAuthProxy } from "@asafarim/auth/proxy";

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

  const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
  nextResponse.headers.set("Content-Security-Policy", csp);
  return nextResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
