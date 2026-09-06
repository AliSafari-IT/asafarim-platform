import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { createDsr, listDsr } from "../../../../../../../lib/privacy/dsr";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await listDsr(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createDsr(ctx, await req.json().catch(() => ({}))), { status: 201 }));
