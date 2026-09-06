import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity, recordAudit } from "../events/emit";
import { EVENT } from "../events/names";
import { getViewer } from "../session";
import { getTasksAiDb } from "../db/client";
import { notifyMany } from "./notifications";

const INVITE_TTL_DAYS = 14;

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "guest"]).default("member"),
});

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function createInvitation(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "membership.invite");
  const { email, role } = inviteSchema.parse(input);
  const emailHash = hashEmail(email);

  // Already a member? Nothing to do — but don't reveal membership to a
  // caller who might be probing: a plain conflict is fine here since the
  // caller is an admin of this workspace.
  const existing = await ctx.db.membership.findFirst({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true, platformUserId: true },
  });
  void existing;

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  try {
    const invitation = await ctx.db.invitation.create({
      data: {
        workspaceId: ctx.workspaceId,
        email,
        emailHash,
        role,
        token,
        invitedById: ctx.actor.membershipId,
        expiresAt,
      },
    });
    await recordAudit(ctx.db, ctx.workspaceId, EVENT.membershipAdded, ctx.actor.membershipId, {
      invitationId: invitation.id,
      emailHash,
      role,
    });
    return { id: invitation.id, email, role, expiresAt, token };
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002") {
      throw new ApiError("conflict_unique", { field: "email", reason: "a pending invitation exists" });
    }
    throw err;
  }
}

export async function listInvitations(ctx: RequestContext) {
  authorize(ctx.actor, "membership.invite");
  return ctx.db.invitation.findMany({
    where: { workspaceId: ctx.workspaceId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });
}

export async function revokeInvitation(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "membership.invite");
  const res = await ctx.db.invitation.updateMany({
    where: { id, workspaceId: ctx.workspaceId, status: "pending" },
    data: { status: "revoked" },
  });
  if (res.count === 0) throw new ApiError("not_found");
  return { revoked: true };
}

/**
 * Accept an invitation by token. Resolves the caller from the session (the
 * token is the proof of address, the session is the proof of identity).
 * Replaying an accepted or revoked token is a 404 — no information leak,
 * and no second membership.
 */
export async function acceptInvitation(token: string, correlationId: string) {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("unauthenticated");
  const db = getTasksAiDb();

  return db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({
      where: { token, status: "pending" },
    });
    if (!invitation) throw new ApiError("not_found");
    if (invitation.expiresAt < new Date()) {
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
      throw new ApiError("not_found");
    }

    const membership = await tx.membership.upsert({
      where: {
        workspaceId_platformUserId: {
          workspaceId: invitation.workspaceId,
          platformUserId: viewer.id,
        },
      },
      create: {
        workspaceId: invitation.workspaceId,
        platformUserId: viewer.id,
        role: invitation.role,
      },
      update: { archivedAt: null },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await emitActivity(tx, invitation.workspaceId, correlationId, {
      name: EVENT.membershipAdded,
      targetType: "membership",
      targetId: membership.id,
      actorId: membership.id,
      data: { role: membership.role, via: "invitation" },
    });

    await notifyMany(tx, invitation.workspaceId, membership.id, [
      {
        recipientId: invitation.invitedById,
        kind: "invite_accepted",
        data: { membershipId: membership.id },
        dedupeKey: `invite_accepted:${invitation.id}`,
      },
    ]);

    return { workspaceId: invitation.workspaceId, membershipId: membership.id, role: membership.role };
  });
}
