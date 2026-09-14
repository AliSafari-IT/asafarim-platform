import { workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { myWorkData } from "../../../../../../lib/work/service";

export const dynamic = "force-dynamic";

/**
 * My Work (issue #367): the caller's open, triaged, cross-project work with
 * the project / status / dependency context the execution view needs, plus
 * the workspace counts that let the page explain an empty list.
 *
 * Rows come back in the order the view renders them — overdue, today,
 * blocked, upcoming, undated, each group in its own order — and are
 * cursor-paginated like every other collection, so a later page never
 * inserts rows above ones already on screen. `meta.summary` counts the whole
 * scoped set, not the returned page.
 */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const { cursor, limit } = parsePagination(new URL(req.url));
  const { items, nextCursor, summary, counts } = await myWorkData(ctx, { cursor, limit });
  return page(items, nextCursor, { summary, counts });
});
