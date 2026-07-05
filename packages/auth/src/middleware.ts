import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Configurable auth middleware for any app in the monorepo.
 *
 * Usage in each app's middleware.ts:
 *
 * ```ts
 * export { authMiddleware as middleware } from "@asafarim/auth/middleware";
 * export const config = { matcher: ["/dashboard/:path*", "/api/protected/:path*"] };
 * ```
 *
 * Or with custom logic:
 *
 * ```ts
 * import { createAuthMiddleware } from "@asafarim/auth/middleware";
 * export const middleware = createAuthMiddleware({
 *   publicRoutes: ["/", "/about", "/api/health"],
 *   signInUrl: "https://hub.asafarim.com/sign-in",
 * });
 * ```
 */

interface AuthMiddlewareOptions {
  /** Routes that don't require authentication */
  publicRoutes?: string[];
  /** URL to redirect unauthenticated users to (defaults to /sign-in) */
  signInUrl?: string;
  /** Routes that require specific roles (user must have at least one) */
  roleRoutes?: Record<string, string[]>;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const {
    publicRoutes = ["/", "/api/health"],
    signInUrl,
    roleRoutes = {},
  } = options;

  return async (req: NextRequest) => {
    const { pathname } = req.nextUrl;

    // Allow public routes
    const isPublic = publicRoutes.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );
    if (isPublic) return NextResponse.next();

    // Allow Auth.js API routes
    if (pathname.startsWith("/api/auth")) return NextResponse.next();

    // Check authentication.
    //
    // cookieName/salt/secureCookie are pinned to match the NextAuth config in
    // packages/auth/src/config.ts. This matters in production where the
    // reverse proxy terminates TLS and forwards HTTP to Next.js: getToken's
    // auto-detection would otherwise look for the non-secure cookie name
    // while the browser actually holds `__Secure-authjs.session-token`.
    const isProd = process.env.NODE_ENV === "production";
    const cookieName = isProd
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName,
      salt: cookieName,
      secureCookie: isProd,
    });
    if (!token?.sub) {
      // Never redirect API calls — return 401 JSON so fetch() callers can handle it
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const redirectUrl = signInUrl
        ? new URL(signInUrl)
        : new URL("/sign-in", req.nextUrl.origin);

      // If the sign-in page lives on a different origin (centralized SSO),
      // send an absolute callback URL so the sign-in app can bounce the
      // user back to the app they originally tried to access.
      const relativeCallbackUrl =
        `${req.nextUrl.pathname}${req.nextUrl.search}` || "/";

      // Prefer the public-facing origin from forwarded headers (set by the
      // reverse proxy) or AUTH_URL. Avoids leaking the internal bind address
      // (0.0.0.0) when the app runs behind a reverse proxy inside Docker.
      const forwardedHost = req.headers.get("x-forwarded-host");
      const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
      const publicOrigin =
        (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null) ??
        process.env.AUTH_URL ??
        req.nextUrl.origin;

      const callbackUrl =
        redirectUrl.origin === new URL(publicOrigin).origin
          ? relativeCallbackUrl
          : new URL(relativeCallbackUrl, publicOrigin).toString();
      redirectUrl.searchParams.set("callbackUrl", callbackUrl);
      return NextResponse.redirect(redirectUrl);
    }

    // Block deactivated users
    if (token.isActive === false) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }

    // Check role-based access
    const userRoles: string[] = Array.isArray(token.roles) ? token.roles : [];
    const isSuperAdmin = userRoles.includes("superadmin");

    for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        // Superadmin always passes
        if (isSuperAdmin) continue;

        const hasRouteRole = userRoles.some((r) => allowedRoles.includes(r));
        if (!hasRouteRole) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    return NextResponse.next();
  };
}

/**
 * Default middleware — protects everything except public routes.
 * Apps can override with createAuthMiddleware() for custom behavior.
 */
export const authMiddleware = createAuthMiddleware();
