import "server-only";
import { auth } from "@asafarim/auth";
import { redirect } from "next/navigation";
import type { Actor } from "./actor";

// AppBuilder has no local sign-in page — the centralized flow lives on Hub.
const hubUrl =
  process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";

/**
 * The trusted actor for the current request, derived only from the shared
 * SSO session — never from anything client-supplied. Returns null for a
 * missing, invalid, expired, or deactivated session.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.isActive === false) return null;
  return { principalId: session.user.id, roles: session.user.roles ?? [] };
}

/**
 * Server Component guard: requires an active session, redirecting through
 * the centralized Hub sign-in (with a safe, absolute callback back to this
 * app) otherwise. Defense-in-depth alongside proxy.ts, which already blocks
 * unauthenticated/deactivated requests to every non-public route.
 */
export async function requireActor(options?: { callbackUrl?: string }): Promise<Actor> {
  const actor = await getActor();
  if (actor) return actor;

  const signInUrl = new URL("/sign-in", hubUrl);
  if (options?.callbackUrl) {
    signInUrl.searchParams.set("callbackUrl", options.callbackUrl);
  }
  redirect(signInUrl.toString());
}
