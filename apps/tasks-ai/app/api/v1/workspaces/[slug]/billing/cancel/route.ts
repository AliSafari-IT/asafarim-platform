import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { cancelSubscription } from "../../../../../../../lib/billing/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ ctx }) => ok(await cancelSubscription(ctx)));
