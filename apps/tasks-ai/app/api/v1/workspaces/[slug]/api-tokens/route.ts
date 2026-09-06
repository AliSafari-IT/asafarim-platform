import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createToken, listTokens } from "../../../../../../lib/tokens/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await listTokens(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createToken(ctx, await req.json().catch(() => ({}))), { status: 201 }));
