import "server-only";
import { z } from "zod";
import type { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { getTaskOr404 } from "../repositories/tasks";
import {
  INBOX_PROJECT_DESCRIPTION,
  INBOX_PROJECT_KEY,
  INBOX_PROJECT_NAME,
} from "./inbox";

/**
 * The Inbox container + triage service (issue #366).
 *
 * `ensureInboxProject` gives every workspace exactly one project row that
 * captured work can land in when nobody has decided where it belongs. It is
 * created lazily — a workspace that never captures without a project never
 * grows one — and it keeps `Task.projectId` NOT NULL, so nothing in the
 * existing task/query/export/analytics surface has to learn about a
 * project-less task.
 */

type DbLike = Pick<PrismaClient, "project">;

/**
 * Find (or create) the workspace Inbox container. Key collisions with a
 * user-made project called "INBOX" are stepped around rather than stolen.
 */
export async function ensureInboxProjectFor(db: DbLike, workspaceId: string) {
  const existing = await db.project.findFirst({
    where: { workspaceId, isInbox: true, archivedAt: null },
  });
  if (existing) return existing;

  for (const suffix of ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
    const key = `${INBOX_PROJECT_KEY}${suffix}`;
    const clash = await db.project.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (clash) continue;
    return db.project.create({
      data: {
        workspaceId,
        key,
        name: INBOX_PROJECT_NAME,
        description: INBOX_PROJECT_DESCRIPTION,
        isInbox: true,
      },
    });
  }
  throw new ApiError("conflict_unique", { field: "key", reason: "no free Inbox project key" });
}

export async function ensureInboxProject(ctx: RequestContext) {
  return ensureInboxProjectFor(ctx.db, ctx.workspaceId);
}

/** The Inbox container, if this workspace has one yet. */
export async function findInboxProject(ctx: RequestContext) {
  return ctx.db.project.findFirst({
    where: { workspaceId: ctx.workspaceId, isInbox: true, archivedAt: null },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Triage
// ──────────────────────────────────────────────────────────────────────

export const triageSchema = z.object({
  /** Where the work actually belongs. */
  projectId: z.string().optional(),
  /** `null` clears the owner. */
  assigneeId: z.string().nullable().optional(),
  dueDate: z.union([z.string().datetime(), z.date()]).nullable().optional(),
  /**
   * Whether the item leaves the Inbox. Defaults to true — triage is the act
   * of organizing — but a caller can set fields without closing triage.
   */
  triaged: z.boolean().default(true),
});

/**
 * Organize one Inbox item in a single round trip: project, owner, date, and
 * the triage stamp together, so the triage list never needs a deep
 * task-detail workflow for every field.
 */
export async function triageTask(ctx: RequestContext, id: string, input: unknown) {
  authorize(ctx.actor, "task.update");
  const data = triageSchema.parse(input);
  const current = await getTaskOr404(ctx, id);

  if (data.projectId && data.projectId !== current.projectId) {
    const target = await ctx.db.project.findFirst({
      where: { id: data.projectId, workspaceId: ctx.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!target) throw new ApiError("not_found", { field: "projectId" });
    if (current.parentId) {
      // A subtask cannot outrun its parent into another project.
      throw new ApiError("validation_failed", {
        projectId: "detach the subtask before moving it to another project",
      });
    }
  }

  const triagedAt = data.triaged ? (current.triagedAt ?? new Date()) : null;

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: current.id },
      data: {
        ...(data.projectId ? { projectId: data.projectId } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate === null ? null : new Date(data.dueDate) }
          : {}),
        triagedAt,
        version: { increment: 1 },
      },
    });

    await emitActivity(
      tx,
      ctx.workspaceId,
      ctx.correlationId,
      {
        name: EVENT.taskTriaged,
        targetType: "task",
        targetId: updated.id,
        actorId: ctx.actor.membershipId,
        data: {
          triaged: Boolean(triagedAt),
          projectId: updated.projectId,
          assigneeId: updated.assigneeId,
          source: updated.source,
        },
      },
      [{ type: OUTBOX_TYPE.searchIndex, payload: { taskId: updated.id } }],
    );

    if (data.assigneeId !== undefined && data.assigneeId !== current.assigneeId) {
      await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
        name: EVENT.taskAssigned,
        targetType: "task",
        targetId: updated.id,
        actorId: ctx.actor.membershipId,
        data: { assigneeId: data.assigneeId },
      });
    }

    return updated;
  });
}

// ──────────────────────────────────────────────────────────────────────
// Reading the Inbox
// ──────────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string;
  projectIsInbox: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  source: string;
  createdAt: string;
  version: number;
}

/**
 * The Inbox list. One query, one rule: not triaged, not completed, not
 * archived (lib/capture/inbox.ts). Guests see only the projects they belong
 * to, exactly like every other read.
 */
export async function listInbox(ctx: RequestContext, limit = 100): Promise<InboxItem[]> {
  const rows = await ctx.db.task.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      triagedAt: null,
      completedAt: null,
      archivedAt: null,
      ...(ctx.actor.role === "guest"
        ? {
            project: {
              members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } },
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { project: { select: { name: true, isInbox: true } } },
  });

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    projectName: t.project.name,
    projectIsInbox: t.project.isInbox,
    assigneeId: t.assigneeId,
    dueDate: t.dueDate?.toISOString() ?? null,
    source: t.source,
    createdAt: t.createdAt.toISOString(),
    version: t.version,
  }));
}

/** Workspace members, for "assign to me / to a teammate" during triage. */
export async function listAssignableMembers(ctx: RequestContext) {
  const rows = await ctx.db.membership.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null, role: { not: "guest" } },
    select: { id: true, platformUserId: true, role: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  // TasksAI stores only the opaque platform user id (docs/adr/0002) — there
  // is no name column to leak here. The viewer's own row is flagged so the
  // UI can say "me" instead of an id.
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    platformUserId: m.platformUserId,
    isMe: m.id === ctx.actor.membershipId,
  }));
}
