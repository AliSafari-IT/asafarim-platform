import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { getTasksAiDb } from "../db/client";
import { emitActivity } from "../events/emit";
import { EVENT } from "../events/names";

/**
 * Capture-by-email. Each workspace gets one address:
 *   tasks+<localPart>@inbound.tasks-ai.asafarim.com
 * where localPart = "<slug8>-<hmac10>". The HMAC (keyed by a per-workspace
 * secret) makes the address unguessable: a spoofed sender who does not know
 * the address cannot inject tasks. A message-id is accepted at most once
 * per workspace (replay guard).
 */
export async function provisionInboundAddress(ctx: RequestContext, projectId?: string) {
  authorize(ctx.actor, "membership.invite");
  const existing = await ctx.db.inboundAddress.findUnique({ where: { workspaceId: ctx.workspaceId } });
  if (existing) return publicView(existing);

  const secret = randomBytes(32).toString("hex");
  const base = ctx.workspaceSlug.replace(/[^a-z0-9]/g, "").slice(0, 8) || "ws";
  const sig = createHmac("sha256", secret).update(ctx.workspaceId).digest("hex").slice(0, 10);
  const localPart = `${base}-${sig}`;

  const row = await ctx.db.inboundAddress.create({
    data: { workspaceId: ctx.workspaceId, localPart, secret, projectId: projectId ?? null },
  });
  return publicView(row);
}

export async function getInboundAddress(ctx: RequestContext) {
  const row = await ctx.db.inboundAddress.findUnique({ where: { workspaceId: ctx.workspaceId } });
  return row ? publicView(row) : null;
}

function publicView(row: { localPart: string; projectId: string | null }) {
  return {
    address: `tasks+${row.localPart}@inbound.tasks-ai.asafarim.com`,
    localPart: row.localPart,
    projectId: row.projectId,
  };
}

export interface InboundEmail {
  localPart: string;
  messageId: string;
  subject: string;
  text: string;
  from: string;
}

/**
 * Machine entrypoint (called by the mail webhook route, which authenticates
 * its own bearer token). Verifies the localPart's HMAC against the stored
 * secret, rejects a replayed message-id, and creates a task with
 * source="import" provenance.
 */
export async function receiveInboundEmail(email: InboundEmail, correlationId: string) {
  const db = getTasksAiDb();
  const address = await db.inboundAddress.findUnique({ where: { localPart: email.localPart } });
  if (!address) throw new ApiError("not_found");

  const [, sig] = email.localPart.split("-");
  const expected = createHmac("sha256", address.secret)
    .update(address.workspaceId)
    .digest("hex")
    .slice(0, 10);
  if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new ApiError("forbidden", { reason: "address signature mismatch" });
  }

  const project =
    (address.projectId &&
      (await db.project.findFirst({
        where: { id: address.projectId, workspaceId: address.workspaceId, archivedAt: null },
      }))) ||
    (await db.project.findFirst({
      where: { workspaceId: address.workspaceId, archivedAt: null },
      orderBy: { createdAt: "asc" },
    }));
  if (!project) throw new ApiError("validation_failed", { reason: "workspace has no project to capture into" });

  try {
    return await db.$transaction(async (tx) => {
      await tx.inboundMessage.create({
        data: { workspaceId: address.workspaceId, messageId: email.messageId },
      });
      const task = await tx.task.create({
        data: {
          workspaceId: address.workspaceId,
          projectId: project.id,
          title: email.subject.trim().slice(0, 500) || "(no subject)",
          description: `From: ${email.from}\n\n${email.text}`.slice(0, 20000),
          source: "import",
        },
      });
      await tx.inboundMessage.updateMany({
        where: { workspaceId: address.workspaceId, messageId: email.messageId },
        data: { taskId: task.id },
      });
      await emitActivity(tx, address.workspaceId, correlationId, {
        name: EVENT.taskCreated,
        targetType: "task",
        targetId: task.id,
        actorType: "system",
        data: { source: "inbound_email", from: email.from },
      });
      return { taskId: task.id, projectId: project.id };
    });
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002") {
      throw new ApiError("conflict_unique", { reason: "message already processed" });
    }
    throw err;
  }
}
