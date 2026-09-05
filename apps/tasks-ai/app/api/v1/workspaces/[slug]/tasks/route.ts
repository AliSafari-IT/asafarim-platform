import { withIdempotency, workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { listTasks } from "../../../../../../lib/repositories/tasks";
import { createTask } from "../../../../../../lib/services/tasks";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const { cursor, limit } = parsePagination(url);
  const { items, nextCursor } = await listTasks(ctx, {
    cursor,
    limit,
    projectId: url.searchParams.get("projectId") ?? undefined,
    assigneeId: url.searchParams.get("assigneeId") ?? undefined,
    statusId: url.searchParams.get("statusId") ?? undefined,
    includeArchived: url.searchParams.get("archived") === "true",
  });
  return page(items, nextCursor);
});

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return withIdempotency(ctx, req, body, async () => ({
    status: 201,
    data: await createTask(ctx, body),
  }));
});
