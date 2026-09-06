import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { revokeMemberAccess } from "../../../../../../../../../lib/admin/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ ctx, params }) => ok(await revokeMemberAccess(ctx, params.id)));
