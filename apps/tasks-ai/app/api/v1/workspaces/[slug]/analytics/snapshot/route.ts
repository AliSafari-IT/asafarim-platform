import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { snapshotMetrics } from "../../../../../../../lib/analytics/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ ctx }) => ok(await snapshotMetrics(ctx), { status: 201 }));
