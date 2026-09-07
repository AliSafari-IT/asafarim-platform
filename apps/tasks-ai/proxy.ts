import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAuthProxy } from "@asafarim/auth/proxy";
import { contentSecurityPolicy } from "./lib/security/headers";

const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

/**
 * TasksAI is public-landing / private-workspace. The marketing landing and
 * legal pages are open; everything under /workspace reads or writes tenant
 * data and requires a platform session. Machine endpoints authenticate
 * their own bearer token and 404 when unset, so they carry no session.
 */
const authProxy = createAuthProxy({
  publicRoutes: [
    "/",
    "/privacy",
    "/terms",
    "/robots.txt",
    "/api/health",
    "/api/auth",
    "/api/v1/openapi.json",
    // Machine endpoints: authenticate their own token/HMAC, carry no
    // session (see each route).
    "/api/inbound/email",
    "/api/integrations/github",
    "/api/billing/stripe",
  ],
  signInUrl: `${hubUrl}/sign-in`,
});

// Extra origins the browser may connect to (provider APIs). Kept here rather
// than next.config so the whole CSP — including the per-request nonce below —
// is emitted from one place.
const providerConnect = [
  process.env.NEXT_PUBLIC_HUB_URL,
  "https://api.anthropic.com",
  "https://api.openai.com",
]
  .filter((u): u is string => Boolean(u))
  .map((u) => (u.startsWith("http") ? new URL(u).origin : u));

const isDev = process.env.NODE_ENV !== "production";
const reportOnly = process.env.TASKSAI_CSP_REPORT_ONLY === "true";
const cspHeaderName = reportOnly
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

/**
 * The CSP carries a fresh per-request nonce so the production policy can be
 * `script-src 'self' 'nonce-…' 'strict-dynamic'` without bricking hydration:
 * Next.js reads that nonce from the CSP header it sees on the *request* and
 * stamps it onto every framework-injected `<script>` (RSC payloads, the
 * webpack bootstrap, chunk loaders). Our own inline `<script>` (the theme
 * bootstrap in app/layout.tsx) reads the same value from `x-nonce`.
 * See https://nextjs.org/docs/app/guides/content-security-policy.
 *
 * A static header in next.config can't do this (no per-request value), so
 * the CSP lives here and next.config only sets the nonce-independent headers.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const authResult = await authProxy(request);

  // createAuthProxy only ever returns a redirect (signed-out), a JSON error
  // (deactivated/forbidden), or NextResponse.next() (200). Only the 200
  // pass-through renders an HTML document that needs the nonce'd CSP.
  if (authResult.status !== 200) return authResult;

  // Dev (Turbopack HMR) uses a loose inline/eval policy and no nonce; prod
  // gets a fresh per-request nonce.
  const nonce = isDev ? undefined : Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({
    nonce,
    connectSrc: providerConnect,
    dev: isDev,
  });

  const requestHeaders = new Headers(request.headers);
  // Next.js's own scripts pick the nonce up from the request CSP header…
  requestHeaders.set("Content-Security-Policy", csp);
  // …and Server Components (app/layout.tsx's <ThemeScript nonce={…} />) read
  // it from here.
  if (nonce) requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName, csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
