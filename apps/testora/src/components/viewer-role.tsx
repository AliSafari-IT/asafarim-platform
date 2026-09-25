"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the signed-in viewer may manage Testora's catalog (admin or
 * superadmin). Computed once on the server in the (app) layout from the
 * session and provided to client components, so admin-only controls are
 * hidden for members.
 *
 * This only shapes the UI — the real enforcement is src/proxy.ts +
 * src/lib/access-policy.ts, which refuse the underlying API calls.
 */
const CanManageContext = createContext(false);

export function CanManageProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <CanManageContext.Provider value={value}>{children}</CanManageContext.Provider>;
}

export function useCanManage(): boolean {
  return useContext(CanManageContext);
}

/** Renders its children only for admins/superadmins. */
export function AdminOnly({ children }: { children: ReactNode }) {
  return useCanManage() ? <>{children}</> : null;
}
