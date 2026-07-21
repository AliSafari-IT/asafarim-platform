import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";

export type AuditEventRow = typeof auditEvents.$inferSelect;

export async function listAuditEventsForActor(db: Db, actor: Actor, appId: string): Promise<AuditEventRow[]> {
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(auditEvents).where(eq(auditEvents.appId, appId)).orderBy(desc(auditEvents.createdAt));
}
