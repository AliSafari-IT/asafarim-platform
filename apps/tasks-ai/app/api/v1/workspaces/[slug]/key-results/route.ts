import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { upsertKeyResult } from "../../../../../../lib/analytics/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await upsertKeyResult(ctx, await req.json().catch(() => ({}))), { status: 201 }));
