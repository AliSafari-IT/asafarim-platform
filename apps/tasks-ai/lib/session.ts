import "server-only";
import { getSession } from "@asafarim/auth";

/**
 * Session boundary for TasksAI. In M01 there is no work graph yet, so this
 * only resolves the opaque platform user id and the active-account flag.
 * M02 adds workspace resolution and the tenant authorization boundary
 * (docs/adr/0002-tenant-model.md) on top of this.
 *
 * TasksAI stores this id and nothing else about the user
 * (docs/adr/0001-dedicated-database.md): no email, no name copy, no
 * credentials.
 */
export interface PlatformViewer {
  /** Opaque platform user id. The only identity fact TasksAI persists. */
  id: string;
  roles: string[];
}

export async function getViewer(): Promise<PlatformViewer | null> {
  const session = await getSession();
  const id = session?.user?.id;
  if (!id || session.user.isActive === false) return null;
  return { id, roles: session.user.roles ?? [] };
}
