import type { Session } from "next-auth";
import { ROLES, getSession, hasPermission, hasRole } from "@asafarim/auth";
import { SEED_PERMISSIONS, type SeedActor } from "@asafarim/seed-manager";

/**
 * Build the seed-manager actor from the current session.
 *
 * Permissions are resolved eagerly rather than checked lazily so that the
 * authorization decision for a whole bulk request is made from one consistent
 * snapshot, and so the page can render accurate affordances without a second
 * round of checks.
 */
export type ActorResolution =
  | { ok: true; session: Session; actor: SeedActor }
  | { ok: false; error: string };

export async function resolveSeedActor(): Promise<ActorResolution> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return { ok: false, error: "Not signed in." };
  }
  if (!hasRole(session, [ROLES.ADMIN])) {
    return { ok: false, error: "Admin access required." };
  }

  const granted: string[] = [];
  for (const permission of Object.values(SEED_PERMISSIONS)) {
    if (await hasPermission(session, permission)) granted.push(permission);
  }

  return {
    ok: true,
    session,
    actor: {
      userId: session.user.id,
      roles: session.user.roles ?? [],
      permissions: granted,
      sessionIssuedAtMs: sessionIssuedAtMs(session),
    },
  };
}

/**
 * Best-effort session age. Auth.js JWT sessions expose `expires`, so we work
 * backwards from it using the configured max age. If neither is available we
 * return 0 — which reads as "infinitely old" and fails the production
 * freshness check closed rather than open.
 */
function sessionIssuedAtMs(session: Session): number {
  const raw = (session as { issuedAt?: number; expires?: string }).issuedAt;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Accept both seconds and milliseconds.
    return raw > 1e12 ? raw : raw * 1000;
  }
  const expires = session.expires ? Date.parse(session.expires) : Number.NaN;
  if (Number.isFinite(expires)) {
    return expires - SESSION_MAX_AGE_MS;
  }
  return 0;
}

/** Auth.js default session max age (30 days), used only for the estimate. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
