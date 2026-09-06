import "server-only";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { OUTBOX_TYPE } from "../events/names";

export interface NotifySpec {
  recipientId: string;
  kind: "mention" | "assigned" | "comment" | "watched_change" | "invite_accepted";
  taskId?: string;
  actorId?: string;
  data?: Record<string, unknown>;
  /** Coalescing key: a burst of the same key for the same recipient collapses. */
  dedupeKey?: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Create in-app notifications inside the caller's transaction, one
 * OutboxEvent per notification for email/push dispatch. Self-notifications
 * are dropped (you don't get pinged for your own comment). Dedupe key
 * collisions are swallowed so a notification storm cannot fail the user's
 * action.
 */
export async function notifyMany(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  specs: NotifySpec[],
): Promise<number> {
  let created = 0;
  for (const spec of specs) {
    if (spec.recipientId === actorId) continue;
    try {
      const n = await tx.notification.create({
        data: {
          workspaceId,
          recipientId: spec.recipientId,
          kind: spec.kind,
          taskId: spec.taskId ?? null,
          actorId: spec.actorId ?? actorId,
          data: (spec.data ?? {}) as Prisma.InputJsonValue,
          dedupeKey: spec.dedupeKey ?? null,
        },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId,
          type: OUTBOX_TYPE.notification,
          payload: { notificationId: n.id, kind: n.kind, recipientId: n.recipientId },
          dedupeKey: `${OUTBOX_TYPE.notification}:${n.id}`,
        },
      });
      created += 1;
    } catch (err) {
      // P2002 on dedupeKey — an identical notification already pending. Skip.
      if (!(typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002")) {
        throw err;
      }
    }
  }
  return created;
}

/** The recipient's in-app inbox, newest first. */
export async function listInbox(ctx: RequestContext, opts: { unreadOnly?: boolean; limit: number }) {
  return ctx.db.notification.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      recipientId: ctx.actor.membershipId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
  });
}

export async function markRead(ctx: RequestContext, ids: string[]) {
  const res = await ctx.db.notification.updateMany({
    where: {
      id: { in: ids },
      workspaceId: ctx.workspaceId,
      recipientId: ctx.actor.membershipId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return res.count;
}

export async function getPreferences(ctx: RequestContext) {
  return (
    (await ctx.db.notificationPreference.findUnique({
      where: { membershipId: ctx.actor.membershipId },
    })) ?? {
      membershipId: ctx.actor.membershipId,
      emailDigest: true,
      digestCadence: "daily",
      mentionEmail: true,
      assignmentEmail: true,
      quietHours: null,
    }
  );
}

export async function updatePreferences(ctx: RequestContext, patch: Record<string, unknown>) {
  return ctx.db.notificationPreference.upsert({
    where: { membershipId: ctx.actor.membershipId },
    create: { membershipId: ctx.actor.membershipId, ...patch },
    update: patch,
  });
}
