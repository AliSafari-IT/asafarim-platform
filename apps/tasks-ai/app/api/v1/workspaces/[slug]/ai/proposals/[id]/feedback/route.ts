import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { recordProposalFeedback } from "../../../../../../../../../lib/ai/feedback";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await recordProposalFeedback(ctx, params.id, body), { status: 201 });
});
