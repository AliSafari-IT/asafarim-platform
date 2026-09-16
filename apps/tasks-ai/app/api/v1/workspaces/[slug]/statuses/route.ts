import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createStatus, listStatuses } from "../../../../../../lib/services/statuses";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  return ok(await listStatuses(ctx, { projectId }));
});

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await createStatus(ctx, body), { status: 201 });
});
