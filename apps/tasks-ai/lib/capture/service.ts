import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { getTaskOr404, lockTaskRow, updateTaskWithVersion } from "../repositories/tasks";
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

/** How many keys to try before giving up. Past the readable ones the
 * candidates are random, so this is a safety valve, not a real ceiling. */
const INBOX_KEY_ATTEMPTS = 32;

/**
 * The keys to try, in order: `INBOX`, then `INBOX0`…`INBOX9` (readable, and
 * what an operator expects to see), then random suffixes. Nothing is bounded
 * in practice — a workspace whose users own every readable key can still
 * capture instead of failing with conflict_unique.
 */
function inboxKeyCandidate(attempt: number): string {
  if (attempt === 0) return INBOX_PROJECT_KEY;
  if (attempt <= 10) return `${INBOX_PROJECT_KEY}${attempt - 1}`;
  return `${INBOX_PROJECT_KEY}_${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002"
  );
}

function findInbox(db: DbLike, workspaceId: string) {
  return db.project.findFirst({ where: { workspaceId, isInbox: true, archivedAt: null } });
}

/**
 * Find (or create) the workspace Inbox container. Key collisions with a
 * user-made project called "INBOX" are stepped around rather than stolen.
 */
export async function ensureInboxProjectFor(db: DbLike, workspaceId: string) {
  const existing = await findInbox(db, workspaceId);
  if (existing) return existing;

  for (let attempt = 0; attempt < INBOX_KEY_ATTEMPTS; attempt++) {
    const key = inboxKeyCandidate(attempt);
    const clash = await db.project.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (clash) continue;
    try {
      return await db.project.create({
        data: {
          workspaceId,
          key,
          name: INBOX_PROJECT_NAME,
          description: INBOX_PROJECT_DESCRIPTION,
          isInbox: true,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Two captures raced. Either the partial unique index on
      // (workspaceId) WHERE "isInbox" AND "archivedAt" IS NULL rejected the
      // second container — the winner is the one both callers wanted — or
      // the key was taken between the check and the insert, in which case
      // try the next candidate.
      const winner = await findInbox(db, workspaceId);
      if (winner) return winner;
    }
  }
  throw new ApiError("conflict_unique", { field: "key", reason: "no free Inbox project key" });
}

export async function ensureInboxProject(ctx: RequestContext) {
  return ensureInboxProjectFor(ctx.db, ctx.workspaceId);
}

/** The Inbox container, if this workspace has one yet. */
export async function findInboxProject(ctx: RequestContext) {
  return findInbox(ctx.db, ctx.workspaceId);
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
export async function triageTask(
  ctx: RequestContext,
  id: string,
  input: unknown,
  expectedVersion?: number,
) {
  authorize(ctx.actor, "task.update");
  const data = triageSchema.parse(input);
  const current = await getTaskOr404(ctx, id);

  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    throw new ApiError("conflict_version", { expected: expectedVersion, current: current.version });
  }

  const movesProject = Boolean(data.projectId && data.projectId !== current.projectId);
  if (movesProject) {
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

  // An owner must be a real, active, non-guest membership of *this*
  // workspace. `Task.assignee` only references `Membership.id`, so without
  // this a caller could hand work to a membership in someone else's
  // workspace.
  if (data.assigneeId) {
    const assignee = await ctx.db.membership.findFirst({
      where: {
        id: data.assigneeId,
        workspaceId: ctx.workspaceId,
        archivedAt: null,
        role: { not: "guest" },
      },
      select: { id: true },
    });
    if (!assignee) throw new ApiError("not_found", { field: "assigneeId" });
  }

  const triagedAt = data.triaged ? (current.triagedAt ?? new Date()) : null;

  try {
    return await ctx.db.$transaction(async (tx) => {
      if (movesProject) {
        // A parent cannot outrun its children: the same-project invariant
        // enforced at creation has to survive triage. Counting before the
        // transaction left a window for a concurrent subtask insert to
        // strand a child in the old project, so take the row lock
        // `createTask` also takes, and count under it.
        await lockTaskRow(tx, current.id);
        const children = await tx.task.count({
          where: { parentId: current.id, archivedAt: null },
        });
        if (children > 0) {
          throw new ApiError("validation_failed", {
            projectId: "detach the subtasks before moving this task to another project",
          });
        }
      }

      // The version is part of the WHERE, not a read-then-write check: two
      // concurrent stale triages must not both succeed. Shared with the My
      // Work quick edits (lib/repositories/tasks.ts) so the two organizing
      // surfaces cannot drift into different concurrency semantics.
      const updated = await updateTaskWithVersion(tx, current, expectedVersion, {
        ...(data.projectId ? { projectId: data.projectId } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate === null ? null : new Date(data.dueDate) }
          : {}),
        triagedAt,
        version: { increment: 1 },
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
  } catch (err) {
    // The conditional UPDATE lost the race. Now that our transaction has
    // rolled back, read the version the winner left behind, so the 409 tells
    // the client what to reconcile against instead of echoing a stale number.
    if (err instanceof ApiError && err.code === "conflict_version") {
      const fresh = await ctx.db.task.findFirst({
        where: { id: current.id, workspaceId: ctx.workspaceId },
        select: { version: true },
      });
      throw new ApiError("conflict_version", {
        expected: expectedVersion,
        ...(fresh ? { current: fresh.version } : {}),
      });
    }
    throw err;
  }
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

export interface AssignableMember {
  id: string;
  role: string;
  platformUserId: string;
  isMe: boolean;
}

/** A page of a collection, in the shape lib/api/http's `page()` serializes. */
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
}

const DEFAULT_PAGE = 25;

/**
 * The Inbox list. One query, one rule: not triaged, not completed, not
 * archived (lib/capture/inbox.ts). Guests see only the projects they belong
 * to, exactly like every other read. Cursor-paginated like every other
 * collection, so an Inbox that grew past one page stays reachable.
 */
export async function listInbox(
  ctx: RequestContext,
  opts: ListOptions = {},
): Promise<Paged<InboxItem>> {
  const limit = opts.limit ?? DEFAULT_PAGE;
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { project: { select: { name: true, isInbox: true } } },
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((t) => ({
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
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

/**
 * Workspace members, for "assign to me / to a teammate" during triage.
 * Paginated, with an optional `q` prefix filter, so a large workspace's
 * later members stay assignable.
 */
export async function listAssignableMembers(
  ctx: RequestContext,
  opts: ListOptions & { q?: string } = {},
): Promise<Paged<AssignableMember>> {
  const limit = opts.limit ?? DEFAULT_PAGE;
  const rows = await ctx.db.membership.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      archivedAt: null,
      role: { not: "guest" },
      ...(opts.q ? { platformUserId: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, platformUserId: true, role: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  // TasksAI stores only the opaque platform user id (docs/adr/0002) — there
  // is no name column to leak here. The viewer's own row is flagged so the
  // UI can say "me" instead of an id.
  const items = rows.slice(0, limit).map((m) => ({
    id: m.id,
    role: m.role,
    platformUserId: m.platformUserId,
    isMe: m.id === ctx.actor.membershipId,
  }));
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}
