import { createAuthMiddleware } from "@asafarim/auth/middleware";

// Authentication gate: everything except sign-in and denied requires a
// session. Role gating (admin/superadmin) happens in the (admin) group
// layout via requireRole, so non-admins get a readable /denied page.
export const middleware = createAuthMiddleware({
  publicRoutes: ["/sign-in", "/denied", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
