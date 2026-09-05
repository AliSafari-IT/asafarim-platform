import { withIdempotency, workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { listProjects } from "../../../../../../lib/repositories/projects";
import { createProject } from "../../../../../../lib/services/projects";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const { cursor, limit } = parsePagination(url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const { items, nextCursor } = await listProjects(ctx, { cursor, limit, includeArchived });
  return page(items, nextCursor);
});

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return withIdempotency(ctx, req, body, async () => ({
    status: 201,
    data: await createProject(ctx, body),
  }));
});


