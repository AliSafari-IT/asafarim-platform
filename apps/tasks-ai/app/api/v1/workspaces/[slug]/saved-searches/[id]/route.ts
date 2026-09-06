import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { deleteSavedSearch } from "../../../../../../../lib/search/saved";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) =>
  ok(await deleteSavedSearch(ctx, params.id)),
);
