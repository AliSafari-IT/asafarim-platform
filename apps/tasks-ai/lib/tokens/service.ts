import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";

export const SCOPES = [
  "tasks:read",
  "tasks:write",
  "projects:read",
  "projects:write",
  "comments:read",
  "comments:write",
  "webhooks:manage",
] as const;
export type Scope = (typeof SCOPES)[number];

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/** Create a token. Plaintext is returned exactly once. */
export async function createToken(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "customfield.manage"); // admin+ to mint credentials
  const data = createSchema.parse(input);
  const plain = `tai_${randomBytes(24).toString("base64url")}`;
  const row = await ctx.db.apiToken.create({
    data: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      name: data.name,
      tokenHash: hashToken(plain),
      prefix: plain.slice(0, 12),
      scopes: data.scopes,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null,
    },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "apitoken.issued", ctx.actor.membershipId, {
    tokenId: row.id,
    scopes: data.scopes,
  }, ctx.correlationId);
  return { id: row.id, name: row.name, scopes: row.scopes, token: plain, prefix: row.prefix, expiresAt: row.expiresAt };
}

export async function listTokens(ctx: RequestContext) {
  return ctx.db.apiToken.findMany({
    where: { workspaceId: ctx.workspaceId, revokedAt: null },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeToken(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "customfield.manage");
  const res = await ctx.db.apiToken.updateMany({
    where: { id, workspaceId: ctx.workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError("not_found");
  await recordAudit(ctx.db, ctx.workspaceId, "apitoken.revoked", ctx.actor.membershipId, { tokenId: id }, ctx.correlationId);
  return { revoked: true };
}

/** Rotate: mint a new token linked to the old one, revoke the old. */
export async function rotateToken(ctx: RequestContext, id: string) {
  authorize(ctx.actor, "customfield.manage");
  const old = await ctx.db.apiToken.findFirst({ where: { id, workspaceId: ctx.workspaceId, revokedAt: null } });
  if (!old) throw new ApiError("not_found");
  const plain = `tai_${randomBytes(24).toString("base64url")}`;
  const next = await ctx.db.$transaction(async (tx) => {
    await tx.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return tx.apiToken.create({
      data: {
        workspaceId: ctx.workspaceId,
        membershipId: ctx.actor.membershipId,
        name: old.name,
        tokenHash: hashToken(plain),
        prefix: plain.slice(0, 12),
        scopes: old.scopes,
        expiresAt: old.expiresAt,
        rotatedFrom: old.id,
      },
    });
  });
  return { id: next.id, token: plain, prefix: next.prefix };
}

/**
 * Resolve a bearer token to a workspace + scopes. Used by the public API
 * surface. A revoked or expired token resolves to null immediately — the
 * "revoked credentials stop access immediately" requirement.
 */
export async function resolveToken(plain: string): Promise<
  | { workspaceId: string; membershipId: string; scopes: string[]; tokenId: string }
  | null
> {
  if (!plain.startsWith("tai_")) return null;
  const { getTasksAiDb } = await import("../db/client");
  const db = getTasksAiDb();
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashToken(plain) } });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null;
  await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { workspaceId: row.workspaceId, membershipId: row.membershipId, scopes: row.scopes, tokenId: row.id };
}

export function hasScope(scopes: string[], required: Scope): boolean {
  return scopes.includes(required);
}
