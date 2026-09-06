import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { ApiError } from "../../../../../../../../../lib/errors";
import { applyProposal } from "../../../../../../../../../lib/ai/proposals";

export const dynamic = "force-dynamic";

const HIGH_BLAST_RADIUS = 15;

/**
 * Apply a proposal. High-blast-radius applies (many ops, or edited ops)
 * require ?confirm=high — the elevated confirmation from ADR-0004.
 */
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const opCount = Array.isArray(body?.editedOperations)
    ? body.editedOperations.length
    : Array.isArray(body?.accept)
      ? body.accept.length
      : Number.POSITIVE_INFINITY;
  if (opCount > HIGH_BLAST_RADIUS && url.searchParams.get("confirm") !== "high") {
    throw new ApiError("forbidden", {
      reason: "high blast radius — re-send with ?confirm=high",
      opCount,
    });
  }
  return ok(await applyProposal(ctx, params.id, body));
});
