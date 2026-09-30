import { NextResponse } from "next/server";
import { TESTER_ROLE_REQUIRED, isTester } from "@/lib/access-policy";

/**
 * Message for a 403 on a tester-only action. Roles are read from the session
 * JWT, refreshed only at sign-in, so a freshly granted role needs a new
 * sign-in to take effect.
 */
export const TESTER_ROLE_MESSAGE =
  "Running tests and filing issues requires the Tester role — ask an admin. " +
  "If you were just granted Tester, sign out and back in.";

type SessionLike = { user?: { id?: string | null; roles?: readonly string[] | null } | null } | null;

/**
 * The route-level half of the tester gate (the proxy is the other): null when
 * the session may run tests / file issues, otherwise the response to return —
 * 401 signed out, 403 `{ code: "TESTER_ROLE_REQUIRED" }` without the role.
 */
export function testerGuard(session: SessionLike): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isTester(session.user.roles ?? [])) return null;
  return NextResponse.json(
    { error: TESTER_ROLE_MESSAGE, code: TESTER_ROLE_REQUIRED },
    { status: 403 },
  );
}
