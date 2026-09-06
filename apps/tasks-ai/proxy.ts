import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

/**
 * TasksAI is public-landing / private-workspace. The marketing landing and
 * legal pages are open; everything under /workspace reads or writes tenant
 * data and requires a platform session. Machine endpoints authenticate
 * their own bearer token and 404 when unset, so they carry no session.
 */
export const proxy = createAuthProxy({
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
    // Machine endpoint: authenticates its own bearer token, carries no
    // session, 404s when its secret is unset (see the route).
    "/api/inbound/email",
  ],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
