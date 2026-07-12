"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Client-side session context for components using next-auth/react's
 * useSession() (e.g. the sign-in page's "already authenticated" redirect).
 * Seeded with the server-fetched session so there's no extra client fetch
 * or flicker on first paint.
 */
export function SessionProviderWrapper({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
