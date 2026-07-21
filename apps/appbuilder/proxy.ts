import { createAuthProxy } from "@asafarim/auth/proxy";

// Sign-in is centralized on the Hub app (platform SSO) — AppBuilder has no
// local sign-in page of its own.
const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL ||
  process.env.HUB_URL ||
  "http://localhost:3001";

export const proxy = createAuthProxy({
  // "/" stays public (a marketing/overview shell, same convention as Hub's
  // own root) so a signed-out visitor can land on AppBuilder and see a
  // sign-in prompt rather than an immediate bounce. Everything else —
  // /apps, /apps/new, /apps/[appId], /apps/[appId]/preview, and every
  // /api/* route except health — requires an active session.
  publicRoutes: ["/", "/api/health"],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
