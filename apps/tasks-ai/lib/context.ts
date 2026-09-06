import "server-only";
import { getTasksAiDb } from "./db/client";
import type { PrismaClient } from "./db/generated";
import { ApiError } from "./errors";
import type { Actor } from "./authz";
import { getViewer } from "./session";

/**
 * A resolved request context: the tenant and the acting member. No handler
 * takes a workspace id from the client — it is resolved here from the
 * session and the workspace slug in the route, and every repository call
 * is scoped by `context.workspaceId`. This is what makes IDOR structurally
 * unavailable rather than a per-handler checklist item.
 */
export interface RequestContext {
  db: PrismaClient;
  workspaceId: string;
  workspaceSlug: string;
  actor: Actor;
  correlationId: string;
}

export async function resolveContext(
  workspaceSlug: string,
  correlationId: string,
): Promise<RequestContext> {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("unauthenticated");

  const db = getTasksAiDb();
  const workspace = await db.workspace.findFirst({
    where: { slug: workspaceSlug, archivedAt: null },
    select: { id: true, slug: true },
  });
  if (!workspace) throw new ApiError("not_found");

  const membership = await db.membership.findUnique({
    where: { workspaceId_platformUserId: { workspaceId: workspace.id, platformUserId: viewer.id } },
    select: { id: true, role: true, archivedAt: true },
  });
  // A non-member (or removed member) must not learn whether the workspace
  // exists: same 404 as a missing slug.
  if (!membership || membership.archivedAt) throw new ApiError("not_found");

  return {
    db,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    actor: {
      membershipId: membership.id,
      platformUserId: viewer.id,
      role: membership.role,
    },
    correlationId,
  };
}
