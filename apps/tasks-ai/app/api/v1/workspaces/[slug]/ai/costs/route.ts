import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { ApiError } from "../../../../../../../lib/errors";
import { buildCostTimeline, CostRangeTooLargeError } from "../../../../../../../lib/ai/cost/read";
import { parseCostQuery } from "../../../../../../../lib/ai/cost/query";

export const dynamic = "force-dynamic";

/**
 * AI provider cost timeline (issue #591): summary, project subtotals
 * (direct task runs vs shared project runs), workspace-only and legacy
 * groups, and one cursor page of runs — limited to what the caller's role
 * may see (owner/admin: workspace; member/guest: authorized projects).
 * Provider cost, not plan allowance: this never reads UsageMeter.
 */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const { filter, cursor, limit } = parseCostQuery(new URL(req.url).searchParams);
  try {
    return ok(await buildCostTimeline(ctx, filter, { cursor, limit }));
  } catch (err) {
    if (err instanceof CostRangeTooLargeError) throw new ApiError("validation_failed", { reason: err.message });
    throw err;
  }
});
