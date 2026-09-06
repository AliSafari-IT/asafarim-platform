import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createSavedSearch, listSavedSearches } from "../../../../../../lib/search/saved";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await listSavedSearches(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await createSavedSearch(ctx, body), { status: 201 });
});
