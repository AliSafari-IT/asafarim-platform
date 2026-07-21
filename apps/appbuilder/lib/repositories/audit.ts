import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";
import { generateId } from "../db/ids";

/**
 * Internal helper — always called from inside a repository method that has
 * already run `assertCapability`, never exposed as a standalone write path.
 */
export async function recordAuditEvent(
  db: Db,
  params: {
    appId: string;
    actorPrincipalId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    id: generateId(),
    appId: params.appId,
    actorPrincipalId: params.actorPrincipalId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata ?? {},
  });
}
