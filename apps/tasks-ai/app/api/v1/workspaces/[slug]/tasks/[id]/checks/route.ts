import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { createCheck, listChecks } from "../../../../../../../../lib/services/task-checks";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => ok(await listChecks(ctx, params.id)));

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await createCheck(ctx, params.id, body), { status: 201 });
});
