import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { assertVersion, ok } from "../../../../../../../lib/api/http";
import { getProjectOr404 } from "../../../../../../../lib/repositories/projects";
import { archiveProject, updateProject } from "../../../../../../../lib/services/projects";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => {
  return ok(await getProjectOr404(ctx, params.id));
});

export const PATCH = workspaceRoute(async ({ req, ctx, params }) => {
  const current = await getProjectOr404(ctx, params.id);
  assertVersion(req, current.version);
  const body = await req.json().catch(() => ({}));
  return ok(await updateProject(ctx, params.id, body));
});

export const DELETE = workspaceRoute(async ({ req, ctx, params }) => {
  const current = await getProjectOr404(ctx, params.id);
  assertVersion(req, current.version);
  return ok(await archiveProject(ctx, params.id));
});
