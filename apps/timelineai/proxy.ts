import { createAuthProxy } from "@asafarim/auth/proxy";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

export const proxy = createAuthProxy({
  // Public surface: marketing landing, legal pages, guest editor/export/
  // submit flows, and public timeline share pages. Dashboard, admin, and
  // authenticated-mutation routes are gated individually inside the app
  // (see lib/server/authz.ts) rather than blanket-blocked here, because
  // guests must be able to create/export/submit without signing in.
  publicRoutes: [
    "/",
    "/privacy",
    "/terms",
    "/about-this-project", // showcase disclosure — must be readable by anyone
    "/create",
    "/gallery", // public showcase of published timelines
    "/t", // public timeline share pages: /t/[publicId]
    "/robots.txt",
    "/sitemap.xml",
    "/api/health",
    "/api/auth",
    "/api/timelines", // POST create — open to guests; ownership derived server-side
    "/api/timelines/public", // public share-page lookups by publicId
    "/api/exports", // guest + authenticated export requests
  ],
  signInUrl: `${hubUrl}/sign-in`,
  roleRoutes: {
    "/admin": ["admin", "superadmin"],
    "/api/admin": ["admin", "superadmin"],
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
