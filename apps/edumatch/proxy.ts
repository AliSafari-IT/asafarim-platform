import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

export const proxy = createAuthProxy({
  // Public surface: marketing landing + health probe.
  // Everything else requires an authenticated session.
  publicRoutes: ["/", "/privacy", "/terms", "/cookies", "/docs", "/api/health", "/api/docs", "/api/auth"],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
