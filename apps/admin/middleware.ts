import { createAuthMiddleware } from "@asafarim/auth/middleware";

// Everything in the admin app requires authentication except the sign-in
// page; role gating (admin/superadmin only) happens in the pages via
// requireRole, so non-admins get a readable "access denied" page instead of
// a bare 403.
export const middleware = createAuthMiddleware({
  publicRoutes: ["/sign-in", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
