import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok, parsePagination } from "../../../../../../lib/api/http";
import { listInbox } from "../../../../../../lib/services/notifications";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const { limit } = parsePagination(url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  return ok(await listInbox(ctx, { unreadOnly, limit }));
});
