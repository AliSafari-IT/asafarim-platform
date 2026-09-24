import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { exportCostCsv } from "../../../../../../../../lib/ai/cost/csv";
import { parseCostQuery } from "../../../../../../../../lib/ai/cost/query";

export const dynamic = "force-dynamic";

/** CSV of the current authorized filter scope (issue #591). */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const { filter } = parseCostQuery(new URL(req.url).searchParams);
  const csv = await exportCostCsv(ctx, filter);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ai-provider-cost-${ctx.workspaceSlug}-${stamp}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});
