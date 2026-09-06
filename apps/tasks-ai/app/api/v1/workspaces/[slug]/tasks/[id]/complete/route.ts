import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { completeTask } from "../../../../../../../../lib/services/tasks";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ ctx, params }) => {
  return ok(await completeTask(ctx, params.id));
});
