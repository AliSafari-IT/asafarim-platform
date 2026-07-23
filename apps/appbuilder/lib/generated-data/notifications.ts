import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { generatedNotifications } from "../db/schema";
import type { RuntimeContext } from "./runtimeAuth";

export type GeneratedNotificationRow = typeof generatedNotifications.$inferSelect;

/** Always scoped to the CALLER's own principal — there is no "list notifications for another member" path. */
export async function listOwnNotifications(db: Db, ctx: RuntimeContext, limit = 50): Promise<GeneratedNotificationRow[]> {
  return db
    .select()
    .from(generatedNotifications)
    .where(and(eq(generatedNotifications.appId, ctx.appId), eq(generatedNotifications.recipientPrincipalId, ctx.actor.principalId)))
    .orderBy(desc(generatedNotifications.createdAt))
    .limit(Math.min(limit, 100));
}

export async function markNotificationRead(db: Db, ctx: RuntimeContext, notificationId: string): Promise<void> {
  await db
    .update(generatedNotifications)
    .set({ read: true })
    .where(
      and(
        eq(generatedNotifications.id, notificationId),
        eq(generatedNotifications.appId, ctx.appId),
        eq(generatedNotifications.recipientPrincipalId, ctx.actor.principalId),
      ),
    );
}
