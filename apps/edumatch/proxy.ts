import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

export const proxy = createAuthProxy({
  // Public surface: marketing landing, legal pages, the help center (a
  // support surface, not gated content — see #87 AC2), and health/docs
  // probes. Everything else requires an authenticated session.
  publicRoutes: [
    "/",
    "/privacy",
    "/terms",
    "/cookies",
    "/help",
    "/docs",
    "/about-this-project",
    "/api/health",
    // Unauthenticated by design: the showcase proof board's live health
    // check (apps/showcase/app/proof/data.ts's getLiveHealth) does a plain
    // server-to-server fetch with no session cookie, and the same endpoint
    // doubles as this app's Docker healthcheck target (docker-compose.prod.yml).
    // Missing from this allowlist, every request to it 401'd — meaning the
    // proof board's EduMatch health indicator was always reporting
    // "unreachable" regardless of actual health.
    "/api/status",
    "/api/docs",
    "/api/auth",
  ],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
