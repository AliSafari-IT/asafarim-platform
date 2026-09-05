import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

/**
 * JobMatch is public-landing / private-everything-else. Unlike TimelineAI
 * there is no guest flow to preserve: every JobMatch surface beyond the
 * landing and legal pages reads or writes candidate data, so the default
 * here is deny and the public list stays short by design.
 */
export const proxy = createAuthProxy({
  publicRoutes: [
    "/",
    "/privacy",
    "/terms",
    "/robots.txt",
    "/api/health",
    "/api/auth",
    // Scheduler-driven, machine-to-machine endpoints. "Public" here means
    // only that they carry no session — each one authenticates a bearer
    // token itself, in constant time, and 404s outright when its secret is
    // unset. Leaving them behind the session gate made them unreachable by
    // any scheduler, which is how the retention sweep shipped in M2 unable
    // to run at all: the proxy answered before the route's own check.
    "/api/retention",
    "/api/ingestion/sync",
    "/api/ingestion/showcase",
  ],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
