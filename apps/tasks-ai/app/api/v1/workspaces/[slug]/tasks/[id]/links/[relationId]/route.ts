import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { unlinkTasks } from "../../../../../../../../../lib/services/tasks";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) =>
  ok(await unlinkTasks(ctx, params.id, params.relationId)),
);
