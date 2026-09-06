import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";

const endpointSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith("https://"), "must be https"),
  events: z.array(z.string().min(1).max(60)).min(1).max(30),
});

export async function createEndpoint(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "customfield.manage");
  const data = endpointSchema.parse(input);
  const secret = randomBytes(24).toString("base64url");
  const ep = await ctx.db.webhookEndpoint.create({
    data: { workspaceId: ctx.workspaceId, url: data.url, events: data.events, secret },
  });
  // secret returned once
  return { id: ep.id, url: ep.url, events: ep.events, secret, active: ep.active };
}

export async function listEndpoints(ctx: RequestContext) {
  return ctx.db.webhookEndpoint.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });
}

export async function rotateSecret(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "customfield.manage");
  const secret = randomBytes(24).toString("base64url");
  const res = await ctx.db.webhookEndpoint.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: { secret },
  });
  if (res.count === 0) throw new ApiError("not_found");
  return { id, secret };
}

export async function deleteEndpoint(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "customfield.manage");
  await ctx.db.webhookEndpoint.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  return { deleted: true };
}

/**
 * Enqueue one delivery per matching endpoint. `dedupeKey` = `<source>:<event
 * target>`; the `@@unique([endpointId, dedupeKey])` makes re-delivery of the
 * same logical event a no-op — an automation retry cannot double-fire a
 * webhook.
 */
export async function enqueueWebhook(
  client: PrismaClient,
  workspaceId: string,
  endpointId: string | null,
  source: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const endpoints = endpointId
    ? await client.webhookEndpoint.findMany({ where: { id: endpointId, workspaceId, active: true } })
    : await client.webhookEndpoint.findMany({ where: { workspaceId, active: true, events: { has: event } } });

  for (const ep of endpoints) {
    await client.webhookDelivery
      .create({
        data: {
          workspaceId,
          endpointId: ep.id,
          event,
          dedupeKey: `${source}:${event}`,
          payload: payload as Prisma.InputJsonValue,
        },
      })
      .catch((err) => {
        if (!(typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002")) throw err;
      });
  }
}

export function signBody(secret: string, body: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Constant-time verification for inbound provider webhooks. */
export function verifySignature(secret: string, body: string, timestamp: number, provided: string, toleranceSec = 300): boolean {
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false; // replay window
  const expected = signBody(secret, body, timestamp);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

const MAX_ATTEMPTS = 8;

/** Worker: deliver pending webhook rows with exponential backoff. */
export async function drainWebhooksOnce(client: PrismaClient): Promise<{ delivered: number; dead: number }> {
  const now = new Date();
  const rows = await client.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now } },
    include: { endpoint: true },
    take: 50,
  });
  let delivered = 0;
  let dead = 0;
  for (const d of rows) {
    const claimed = await client.webhookDelivery.updateMany({
      where: { id: d.id, status: "pending" },
      data: { status: "failed", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const body = JSON.stringify({ event: d.event, data: d.payload, deliveredAt: now.toISOString() });
    const ts = Math.floor(Date.now() / 1000);
    try {
      const res = await fetch(d.endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tasksai-event": d.event,
          "x-tasksai-timestamp": String(ts),
          "x-tasksai-signature": signBody(d.endpoint.secret, body, ts),
          "x-tasksai-delivery": d.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await client.webhookDelivery.update({ where: { id: d.id }, data: { status: "delivered", responseCode: res.status } });
        delivered += 1;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      const attempts = d.attempts + 1;
      const isDead = attempts >= MAX_ATTEMPTS;
      await client.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: isDead ? "dead" : "pending",
          nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts, 3600) * 1000),
        },
      });
      if (isDead) dead += 1;
    }
  }
  return { delivered, dead };
}
