import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { usageSummary } from "../../../../../../../lib/ai/quota";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await usageSummary(ctx)));
