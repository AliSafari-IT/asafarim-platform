import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { globalSearch, recentSearches, type SearchHit } from "../../../../../../lib/search";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const typesParam = url.searchParams.get("types");
  const types = typesParam
    ? (typesParam.split(",").filter(Boolean) as SearchHit["type"][])
    : undefined;
  if (!q.trim()) return ok({ hits: [], recent: await recentSearches(ctx) });
  return ok({ hits: await globalSearch(ctx, q, { types }) });
});
