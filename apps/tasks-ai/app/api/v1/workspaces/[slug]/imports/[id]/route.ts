import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { getImport } from "../../../../../../../lib/import/service";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => ok(await getImport(ctx, params.id)));
