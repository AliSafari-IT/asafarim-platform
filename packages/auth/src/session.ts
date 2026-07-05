import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "./auth";
import { hasRole } from "./roles";

/** Current session, or null when not signed in. */
export async function getSession(): Promise<Session | null> {
  return auth();
}

/**
 * Require a signed-in, active user. Redirects to the sign-in page
 * (with a callbackUrl) when there is no session.
 */
export async function requireUser(options?: {
  signInUrl?: string;
  callbackUrl?: string;
}): Promise<Session> {
  const session = await auth();

  if (!session?.user?.id || session.user.isActive === false) {
    const signInUrl = options?.signInUrl ?? "/sign-in";
    const callbackUrl = options?.callbackUrl;
    redirect(
      callbackUrl
        ? `${signInUrl}?callbackUrl=${encodeURIComponent(callbackUrl)}`
        : signInUrl
    );
  }

  return session;
}

/**
 * Require a signed-in user with at least one of the given roles.
 * Unauthenticated users are redirected to sign-in; authenticated users
 * without the role are redirected to `deniedUrl` (default "/denied").
 */
export async function requireRole(
  role: string | string[],
  options?: { signInUrl?: string; callbackUrl?: string; deniedUrl?: string }
): Promise<Session> {
  const session = await requireUser(options);

  if (!hasRole(session, role)) {
    redirect(options?.deniedUrl ?? "/denied");
  }

  return session;
}
