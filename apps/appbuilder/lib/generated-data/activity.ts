import type { Db } from "../db/client";
import { generatedActivity } from "../db/schema";
import { generateId } from "../db/ids";

export type ActorKind = "member" | "workflow" | "system";

export interface RecordActivityInput {
  appId: string;
  entityId: string;
  recordId: string | null;
  action: string;
  actorPrincipalId: string | null;
  actorKind: ActorKind;
  metadata?: Record<string, unknown>;
}

/** Append-only activity feed entry. Distinguishes the real platform principal from a workflow/system executor — see generatedActivity's schema comment. */
export async function recordActivity(db: Db, input: RecordActivityInput): Promise<void> {
  await db.insert(generatedActivity).values({
    id: generateId(),
    appId: input.appId,
    entityId: input.entityId,
    recordId: input.recordId,
    action: input.action,
    actorPrincipalId: input.actorPrincipalId,
    actorKind: input.actorKind,
    metadata: input.metadata ?? {},
  });
}
