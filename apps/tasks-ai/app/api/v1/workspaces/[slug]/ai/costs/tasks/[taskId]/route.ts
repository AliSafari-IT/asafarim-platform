import { resolveRange } from "@asafarim/ai-cost-ledger";
import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { ApiError } from "../../../../../../../../../lib/errors";
import { taskCostView } from "../../../../../../../../../lib/ai/cost/read";

export const dynamic = "force-dynamic";

/**
 * One task's AI cost (issue #591): runs attributed to the task, plus the
 * shared project runs that created or touched it — listed, never summed
 * into the task's subtotal. 404 for a task outside the caller's scope.
 */
export const GET = workspaceRoute(async ({ ctx, params }) => {
  const view = await taskCostView(ctx, params.taskId, resolveRange({ preset: "year" }));
  if (!view) throw new ApiError("not_found");
  return ok(view);
});
