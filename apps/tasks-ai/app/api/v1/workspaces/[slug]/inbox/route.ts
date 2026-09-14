import { workspaceRoute } from "../../../../../../lib/api/handler";
import { page, parsePagination } from "../../../../../../lib/api/http";
import { listInbox } from "../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/**
 * The triage inbox (issue #366): captured work that still needs organizing,
 * with the project/provenance context the triage list needs, in one call.
 * Cursor-paginated like every other collection.
 */
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const { cursor, limit } = parsePagination(new URL(req.url));
  const { items, nextCursor } = await listInbox(ctx, { cursor, limit });
  return page(items, nextCursor);
});
