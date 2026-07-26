import { encode } from "next-auth/jwt";

/**
 * Mints a real next-auth v5 JWT session cookie for a validation smoke-test
 * browser — the identical format `tests/e2e/fixtures/session.ts` mints for
 * Playwright specs (duplicated rather than imported: that file lives under
 * `tests/`, which production worker code must never depend on). Exercises
 * the exact same decryption path `getActor()` (lib/auth/session.ts) uses in
 * production; only the login FORM is skipped, never the authorization path
 * itself. The minted principal is always the app's own owner — role
 * coverage (manager/employee_role) is achieved via `?simulateRoleId=`
 * (see lib/generated-data/runtimeAuth.ts's builder role-simulation), never
 * by minting a session for a different principal.
 */
export async function mintSmokeSessionCookie(principalId: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set for validation smoke-test gates to mint a session.");
  }
  return encode({
    secret,
    salt: "authjs.session-token",
    token: {
      sub: principalId,
      roles: [],
      username: `validation-${principalId}`,
      emailVerified: new Date().toISOString(),
      isActive: true,
      name: "Validation Smoke Test",
      picture: null,
    },
  });
}
