import { workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { listAssignableMembers } from "../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/**
 * Members who can own work — the "assign to a teammate" list in triage.
 * Cursor-paginated, with `?q=` for server-side search, so every assignable
 * member stays reachable in a large workspace.
 */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const { cursor, limit } = parsePagination(url);
  const { items, nextCursor } = await listAssignableMembers(ctx, {
    cursor,
    limit,
    q: url.searchParams.get("q") ?? undefined,
  });
  return page(items, nextCursor);
});
