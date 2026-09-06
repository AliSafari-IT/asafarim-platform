import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { copilotMetrics } from "../../../../../../../lib/ai/feedback";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await copilotMetrics(ctx)));
