import { createAuthMiddleware } from "@asafarim/auth/middleware";

export const middleware = createAuthMiddleware({
  publicRoutes: ["/", "/sign-in", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
