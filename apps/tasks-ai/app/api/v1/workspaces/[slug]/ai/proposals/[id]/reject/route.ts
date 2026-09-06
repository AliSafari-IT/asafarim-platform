import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { rejectProposal } from "../../../../../../../../../lib/ai/proposals";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  return ok(await rejectProposal(ctx, params.id, body.reason));
});
