import { NextResponse, type NextRequest } from "next/server";
import { createAuthProxy } from "@asafarim/auth/proxy";
import { PUBLIC_PAGES, isAllowed, isServiceRequest } from "@/lib/access-policy";

// Sign-in is centralized on the Hub app (platform SSO).
const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

// Session gate + role policy (see src/lib/access-policy.ts for the rules).
const authProxy = createAuthProxy({
  publicRoutes: PUBLIC_PAGES,
  signInUrl: `${hubUrl}/sign-in`,
  authorize: isAllowed,
});

export async function proxy(request: NextRequest) {
  // Token-authenticated service endpoints never carry a user session; the
  // route itself verifies the bearer token.
  if (isServiceRequest(request.method, request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return authProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
