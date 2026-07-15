import { createAuthProxy } from "@asafarim/auth/proxy";

// Sign-in is centralized on the Hub app (platform SSO).
const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL ||
  process.env.HUB_URL ||
  "http://localhost:3001";

export const proxy = createAuthProxy({
  publicRoutes: [
    "/",
    "/create",
    "/api/health",
    "/api/projects",
    "/api/render",
    "/api/exports",
    "/api/audio",
    "/api/auth",
  ],
  signInUrl: `${hubUrl}/sign-in`,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
