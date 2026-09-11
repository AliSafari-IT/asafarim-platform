import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { signPayload } from "@asafarim/testora-tasksai-contract";
import { db } from "@/db/client";
import { outboundDeliveries, outboundEvents, outboundWebhooks } from "@/db/schema";
import { nextEventState } from "@/lib/webhook-dispatch-policy";

/**
 * Outbound signed webhook dispatcher (issue #261). Drains `outbound_events`
 * (populated by #260's flake detection and this issue's regression /
 * run.completed producers), signs each delivery with the target's secret
 * (`@asafarim/testora-tasksai-contract` HMAC — same scheme TasksAI's inbound
 * route verifies), and logs every attempt to `outbound_deliveries`.
 *
 * Runs on the request path (called by `enqueueOutboundEvent`) — no worker
 * process for v1, matching the issue's proposal. `POST /api/webhooks/dispatch`
 * redrives anything still `pending` (e.g. after a prior failure's backoff).
 */

const BATCH = 25;
const REQUEST_TIMEOUT_MS = 8000;

export interface DispatchSummary {
  processed: number;
  delivered: number;
  deadLettered: number;
}

export async function dispatchPendingEvents(limit = BATCH): Promise<DispatchSummary> {
  const now = new Date();
  const events = await db.query.outboundEvents.findMany({
    where: and(eq(outboundEvents.status, "pending"), lte(outboundEvents.availableAt, now)),
    orderBy: asc(outboundEvents.availableAt),
    limit,
  });

  let delivered = 0;
  let deadLettered = 0;

  for (const event of events) {
    // Claim it first so a concurrent dispatch call (another request, or the
    // manual redrive route firing mid-run) can't double-send.
    const claimed = await db
      .update(outboundEvents)
      .set({ status: "processing" })
      .where(and(eq(outboundEvents.id, event.id), eq(outboundEvents.status, "pending")))
      .returning({ id: outboundEvents.id });
    if (claimed.length === 0) continue;

    const attempts = event.attempts + 1;
    let ok = true;
    let lastError: string | undefined;
    try {
      const result = await deliverToProjectWebhooks(event);
      ok = result.ok;
      lastError = result.lastError;
    } catch (err) {
      ok = false;
      lastError = err instanceof Error ? err.message.slice(0, 500) : "unknown dispatch error";
    }

    const next = nextEventState({ attempts, ok });
    await db
      .update(outboundEvents)
      .set({
        status: next.status,
        attempts,
        lastError: ok ? null : (lastError ?? "delivery failed"),
        availableAt: new Date(Date.now() + next.availableInSeconds * 1000),
        updatedAt: new Date(),
      })
      .where(eq(outboundEvents.id, event.id));

    if (next.status === "sent") delivered++;
    if (next.status === "dead") deadLettered++;
  }

  return { processed: events.length, delivered, deadLettered };
}

interface EventRow {
  id: string;
  projectId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Delivers one event to every enabled webhook on its project. No endpoint
 *  configured is not an error — it's just nothing to deliver. */
async function deliverToProjectWebhooks(
  event: EventRow,
): Promise<{ ok: boolean; lastError?: string }> {
  const webhooks = await db.query.outboundWebhooks.findMany({
    where: and(eq(outboundWebhooks.projectId, event.projectId), eq(outboundWebhooks.enabled, true)),
  });
  if (webhooks.length === 0) return { ok: true };

  let ok = true;
  let lastError: string | undefined;

  for (const webhook of webhooks) {
    const envelope = {
      v: 1 as const,
      // Stable across retries: the receiver's dedupe (same deliveryId) is a
      // no-op on replay — the event's own id is already a fresh UUID.
      deliveryId: event.id,
      eventType: event.eventType,
      occurredAt: new Date().toISOString(),
      source: "testora" as const,
      data: event.payload,
    };
    const rawBody = JSON.stringify(envelope);
    const signed = signPayload({ secret: webhook.secret, rawBody, deliveryId: event.id });

    let responseStatus: number | undefined;
    let error: string | undefined;
    try {
      const res = await fetchWithTimeout(webhook.url, rawBody, signed.headers);
      responseStatus = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : "network error";
    }

    await db.insert(outboundDeliveries).values({
      id: randomUUID(),
      webhookId: webhook.id,
      outboundEventId: event.id,
      eventType: event.eventType,
      deliveryId: envelope.deliveryId,
      attempt: event.attempts + 1,
      status: error ? "failed" : "sent",
      responseStatus,
      error,
      deliveredAt: error ? null : new Date(),
    });

    if (error) {
      ok = false;
      lastError = error;
    }
  }

  return { ok, lastError };
}

async function fetchWithTimeout(
  url: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: rawBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
