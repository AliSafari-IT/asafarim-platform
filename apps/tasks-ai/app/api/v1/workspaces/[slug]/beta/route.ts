import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { betaStatus } from "../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await betaStatus(ctx)));
