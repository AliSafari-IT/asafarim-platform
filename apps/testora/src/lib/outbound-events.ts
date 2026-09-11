import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { outboundEvents } from "@/db/schema";

export interface EnqueueOutboundEventInput {
  projectId: string;
  /** contract WebhookEventType */
  eventType: string;
  payload: Record<string, unknown>;
  /** Deliver to this URL directly instead of the project's general webhook
   *  subscriptions — the green-light callback (#263) uses this. */
  directUrl?: string;
}

/**
 * Enqueues one outbound-event row and kicks a dispatch pass in the
 * background (issue #261 — "runs on request path... no new worker required
 * for v1"). Fire-and-forget: an enqueue must never fail because the network
 * call to a receiver happens to be slow or down — that's exactly what the
 * outbox + retry/backoff in the dispatcher is for.
 */
export async function enqueueOutboundEvent(input: EnqueueOutboundEventInput): Promise<string> {
  const id = randomUUID();
  await db.insert(outboundEvents).values({
    id,
    projectId: input.projectId,
    eventType: input.eventType,
    payload: input.payload,
    directUrl: input.directUrl ?? null,
  });
  // Lazy import avoids a require-cycle at module init (dispatcher reads this
  // module's table too) and keeps a slow dispatch from blocking the caller.
  import("@/lib/webhook-dispatcher")
    .then(({ dispatchPendingEvents }) => dispatchPendingEvents())
    .catch(() => {});
  return id;
}
