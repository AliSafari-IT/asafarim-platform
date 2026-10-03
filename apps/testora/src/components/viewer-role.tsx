"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * What the signed-in viewer may do, computed once on the server in the (app)
 * layout from the session and provided to client components:
 *   - canManage: manage Testora's catalog (admin or superadmin), so
 *     admin-only controls are hidden for everyone else;
 *   - canRunTests: run tests and file issues (tester, admin or superadmin),
 *     so those controls render disabled with TESTER_ROLE_HINT otherwise.
 *
 * This only shapes the UI — the real enforcement is src/proxy.ts +
 * src/lib/access-policy.ts (and requireTester in the routes), which refuse
 * the underlying API calls.
 */
const CanManageContext = createContext(false);
const CanRunTestsContext = createContext(false);

/** Hint shown next to disabled tester-only controls. */
export const TESTER_ROLE_HINT = "Requires the Tester role — ask an admin, then sign in again";

export function CanManageProvider({
  value,
  canRunTests = value,
  children,
}: {
  value: boolean;
  canRunTests?: boolean;
  children: ReactNode;
}) {
  return (
    <CanManageContext.Provider value={value}>
      <CanRunTestsContext.Provider value={canRunTests}>{children}</CanRunTestsContext.Provider>
    </CanManageContext.Provider>
  );
}

export function useCanManage(): boolean {
  return useContext(CanManageContext);
}

export function useCanRunTests(): boolean {
  return useContext(CanRunTestsContext);
}

/** Renders its children only for admins/superadmins. */
export function AdminOnly({ children }: { children: ReactNode }) {
  return useCanManage() ? <>{children}</> : null;
}
