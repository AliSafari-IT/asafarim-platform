import { workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { myWorkData } from "../../../../../../lib/work/service";

export const dynamic = "force-dynamic";

/**
 * My Work (issue #367): the caller's open, triaged, cross-project work with
 * the project / status / dependency context the execution view needs, plus
 * the workspace counts that let the page explain an empty list. Rows come
 * back in execution order (earliest due first, undated last) and are
 * cursor-paginated like every other collection.
 */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const { cursor, limit } = parsePagination(new URL(req.url));
  const { items, nextCursor, summary, counts } = await myWorkData(ctx, { cursor, limit });
  return page(items, nextCursor, { summary, counts });
});
