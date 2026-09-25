import "server-only";
import { auth } from "@asafarim/auth";
import { isAdminRole } from "@/lib/access-policy";

/** Server-side: whether the current viewer is an admin/superadmin. */
export async function canManageCatalog(): Promise<boolean> {
  const session = await auth();
  return isAdminRole(session?.user?.roles ?? []);
}
