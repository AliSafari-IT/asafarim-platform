import { createAuthProxy } from "@asafarim/auth/proxy";

// Authentication gate: everything except sign-in and denied requires a
// session. Role gating (admin/superadmin) happens in the (admin) group
// layout via requireRole, so non-admins get a readable /denied page.
//
// /api/internal/* is machine-to-machine: no session cookie, so the proxy
// must let it through — each route authenticates its own bearer secret and
// 404s without it.
export const proxy = createAuthProxy({
  publicRoutes: ["/sign-in", "/denied", "/api/health", "/api/internal"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
