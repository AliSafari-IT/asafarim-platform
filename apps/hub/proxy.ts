import { createAuthProxy } from "@asafarim/auth/proxy";

export const proxy = createAuthProxy({
  // /oidc/continue checks the ticket first and the session itself (#782):
  // an invalid ticket gets an error page even when signed out.
  publicRoutes: ["/", "/sign-in", "/sign-up", "/api/health", "/oidc/continue"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
