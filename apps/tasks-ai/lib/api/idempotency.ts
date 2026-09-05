import "server-only";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { hashRequest } from "./http";

export interface ReplayHit {
  responseCode: number;
  responseBody: unknown;
}

/**
 * Idempotency-Key handling for POST mutations. On a repeat key with the
 * same request, the stored response is replayed. On a repeat key with a
 * different request body, it is a 409 — the client reused a key by mistake.
 */
export async function checkIdempotency(
  ctx: RequestContext,
  key: string | null,
  method: string,
  path: string,
  body: unknown,
): Promise<{ replay?: ReplayHit; commit?: (code: number, resBody: unknown) => Promise<void> }> {
  if (!key) return {};
  const requestHash = hashRequest(method, path, body);

  const existing = await ctx.db.idempotencyKey.findUnique({
    where: {
      workspaceId_actorId_key: {
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.membershipId,
        key,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) throw new ApiError("idempotency_mismatch");
    return { replay: { responseCode: existing.responseCode, responseBody: existing.responseBody } };
  }

  const commit = async (code: number, resBody: unknown) => {
    await ctx.db.idempotencyKey.create({
      data: {
        workspaceId: ctx.workspaceId,
        actorId: ctx.actor.membershipId,
        key,
        method,
        path,
        requestHash,
        responseCode: code,
        responseBody: resBody as object,
      },
    });
  };
  return { commit };
}
