import { createAuthProxy } from "@asafarim/auth/proxy";

export const proxy = createAuthProxy({
  publicRoutes: ["/", "/sign-in", "/sign-up", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
