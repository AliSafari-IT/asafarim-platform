import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { assertVersion, ok } from "../../../../../../../lib/api/http";
import { getTaskOr404 } from "../../../../../../../lib/repositories/tasks";
import { deleteTask, updateTask } from "../../../../../../../lib/services/tasks";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => {
  return ok(await getTaskOr404(ctx, params.id));
});

export const PATCH = workspaceRoute(async ({ req, ctx, params }) => {
  const current = await getTaskOr404(ctx, params.id);
  assertVersion(req, current.version);
  const body = await req.json().catch(() => ({}));
  return ok(await updateTask(ctx, params.id, body));
});

export const DELETE = workspaceRoute(async ({ req, ctx, params }) => {
  const current = await getTaskOr404(ctx, params.id);
  assertVersion(req, current.version);
  return ok(await deleteTask(ctx, params.id));
});
