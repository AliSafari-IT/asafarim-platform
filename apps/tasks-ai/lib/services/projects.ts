import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";
import { ApiError } from "../errors";
import { getProjectOr404 } from "../repositories/projects";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]+$/, "uppercase letters and digits, e.g. WEB"),
  description: z.string().max(4000).optional(),
  visibility: z.enum(["workspace", "private"]).default("workspace"),
  teamId: z.string().optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(160),
    description: z.string().max(4000).nullable(),
    visibility: z.enum(["workspace", "private"]),
    teamId: z.string().nullable(),
  })
  .partial();

export async function createProject(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "project.create");
  const data = createProjectSchema.parse(input);

  return ctx.db.$transaction(async (tx) => {
    const clash = await tx.project.findUnique({
      where: { workspaceId_key: { workspaceId: ctx.workspaceId, key: data.key } },
    });
    if (clash) throw new ApiError("conflict_unique", { field: "key" });

    const project = await tx.project.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: data.name,
        key: data.key,
        description: data.description,
        visibility: data.visibility,
        teamId: data.teamId,
        members:
          data.visibility === "private"
            ? { create: { membershipId: ctx.actor.membershipId, role: "admin" } }
            : undefined,
      },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.projectCreated,
      targetType: "project",
      targetId: project.id,
      actorId: ctx.actor.membershipId,
      data: { key: project.key, name: project.name },
    });
    return project;
  });
}

export async function updateProject(ctx: RequestContext, id: string, input: unknown) {
  authorize(ctx.actor, "project.update");
  const patch = updateProjectSchema.parse(input);
  const current = await getProjectOr404(ctx, id);

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: current.id },
      data: { ...patch, version: { increment: 1 } },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.projectUpdated,
      targetType: "project",
      targetId: updated.id,
      actorId: ctx.actor.membershipId,
      data: { changed: Object.keys(patch) },
    });
    return updated;
  });
}

export async function archiveProject(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "project.archive");
  const current = await getProjectOr404(ctx, id);
  if (current.archivedAt) return current;

  return ctx.db.$transaction(async (tx) => {
    const archived = await tx.project.update({
      where: { id: current.id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
      name: EVENT.projectArchived,
      targetType: "project",
      targetId: archived.id,
      actorId: ctx.actor.membershipId,
    });
    return archived;
  });
}
