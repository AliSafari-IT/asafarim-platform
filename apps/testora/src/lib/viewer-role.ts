import "server-only";
import { auth } from "@asafarim/auth";
import { isAdminRole, isTester } from "@/lib/access-policy";
import { testerGuard } from "@/lib/tester-guard";

/** Server-side: whether the current viewer is an admin/superadmin. */
export async function canManageCatalog(): Promise<boolean> {
  const session = await auth();
  return isAdminRole(session?.user?.roles ?? []);
}

/** Server-side: whether the current viewer may run tests and file issues. */
export async function canRunTests(): Promise<boolean> {
  const session = await auth();
  return isTester(session?.user?.roles ?? []);
}

/**
 * Route guard for the tester-only writes (run, cancel, "Update tests", draft /
 * save / publish an issue). The proxy enforces the same rule; this keeps the
 * route safe if a future matcher change ever skips the proxy. Returns the
 * response to send back, or null to continue.
 */
export async function requireTester() {
  return testerGuard(await auth());
}
