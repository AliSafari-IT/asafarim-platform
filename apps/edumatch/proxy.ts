import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

export const proxy = createAuthProxy({
  // Public surface: marketing landing, legal pages, the help center (a
  // support surface, not gated content — see #87 AC2), and health/docs
  // probes. Everything else requires an authenticated session.
  publicRoutes: ["/", "/privacy", "/terms", "/cookies", "/help", "/docs", "/api/health", "/api/docs", "/api/auth"],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
