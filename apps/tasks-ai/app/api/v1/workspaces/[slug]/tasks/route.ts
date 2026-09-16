import { withIdempotency, workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { listTasks } from "../../../../../../lib/repositories/tasks";
import { USER_CAPTURE_SOURCES } from "../../../../../../lib/capture/inbox";
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
    // Subtasks (#370): a task's children are just its parentId siblings.
    parentId: url.searchParams.get("parentId") ?? undefined,
    includeArchived: url.searchParams.get("archived") === "true",
    // `inbox=true` is the persisted Inbox rule (issue #366), not a
    // client-side reinterpretation of "all open tasks".
    inbox: url.searchParams.has("inbox")
      ? url.searchParams.get("inbox") === "true"
      : undefined,
  });
  return page(items, nextCursor);
});

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return withIdempotency(ctx, req, body, async () => ({
    status: 201,
    // A caller may say they typed this or quick-captured it; "import",
    // "email", "integration" and "proposal" are provenance only the
    // corresponding server path gets to claim.
    data: await createTask(ctx, body, { allowedSources: USER_CAPTURE_SOURCES }),
  }));
});
