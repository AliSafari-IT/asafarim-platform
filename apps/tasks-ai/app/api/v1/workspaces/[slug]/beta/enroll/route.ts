import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { enrollBeta } from "../../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await enrollBeta(ctx, await req.json().catch(() => ({}))), { status: 201 }));
