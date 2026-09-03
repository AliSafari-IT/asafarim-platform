import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

/**
 * JobMatch is public-landing / private-everything-else. Unlike TimelineAI
 * there is no guest flow to preserve: every JobMatch surface beyond the
 * landing and legal pages reads or writes candidate data, so the default
 * here is deny and the public list stays short by design.
 */
export const proxy = createAuthProxy({
  publicRoutes: ["/", "/privacy", "/terms", "/robots.txt", "/api/health", "/api/auth"],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
