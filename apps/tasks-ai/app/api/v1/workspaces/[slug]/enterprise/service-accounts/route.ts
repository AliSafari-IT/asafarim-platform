import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { createServiceAccount } from "../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createServiceAccount(ctx, await req.json().catch(() => ({}))), { status: 201 }));
