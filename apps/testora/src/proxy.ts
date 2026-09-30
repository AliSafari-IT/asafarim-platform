import { NextResponse, type NextRequest } from "next/server";
import { createAuthProxy } from "@asafarim/auth/proxy";
import {
  PUBLIC_PAGES,
  TESTER_ROLE_REQUIRED,
  isAllowed,
  isServiceRequest,
  isTesterWrite,
} from "@/lib/access-policy";
import { TESTER_ROLE_MESSAGE } from "@/lib/tester-guard";

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
  const response = await authProxy(request);
  // A refused tester-only write carries a machine-readable code, so the UI can
  // say "ask an admin / sign in again" instead of a bare "Forbidden".
  if (response.status === 403 && isTesterWrite(request.method, request.nextUrl.pathname)) {
    const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "Forbidden") {
      return NextResponse.json(
        { error: TESTER_ROLE_MESSAGE, code: TESTER_ROLE_REQUIRED },
        { status: 403 },
      );
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
