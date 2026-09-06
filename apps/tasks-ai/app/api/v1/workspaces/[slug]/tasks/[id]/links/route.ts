import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { linkTasks } from "../../../../../../../../lib/services/tasks";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await linkTasks(ctx, params.id, body), { status: 201 });
});
