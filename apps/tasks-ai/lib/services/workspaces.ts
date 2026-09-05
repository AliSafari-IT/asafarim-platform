import "server-only";
import { z } from "zod";
import { getTasksAiDb } from "../db/client";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { ApiError } from "../errors";
import { getViewer } from "../session";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and hyphens only"),
});

/**
 * Create a workspace and the caller's owner membership in one transaction,
 * with the workspace.created activity + outbox rows. The caller is
 * resolved from the session here — no platform user id is accepted from
 * the client.
 */
export async function createWorkspace(input: unknown, correlationId: string) {
  const data = createWorkspaceSchema.parse(input);
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("unauthenticated");
  const db = getTasksAiDb();

  return db.$transaction(async (tx) => {
    const clash = await tx.workspace.findUnique({ where: { slug: data.slug } });
    if (clash) throw new ApiError("conflict_unique", { field: "slug" });

    const workspace = await tx.workspace.create({
      data: { name: data.name, slug: data.slug },
    });
    const membership = await tx.membership.create({
      data: { workspaceId: workspace.id, platformUserId: viewer.id, role: "owner" },
    });
    await emitActivity(tx, workspace.id, correlationId, {
      name: EVENT.workspaceCreated,
      targetType: "workspace",
      targetId: workspace.id,
      actorId: membership.id,
      data: { name: workspace.name, slug: workspace.slug },
    });
    return workspace;
  });
}

/** Workspaces the current viewer is an active member of. */
export async function listMyWorkspaces() {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("unauthenticated");
  const db = getTasksAiDb();
  const memberships = await db.membership.findMany({
    where: { platformUserId: viewer.id, archivedAt: null, workspace: { archivedAt: null } },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}
