import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { giveConsent } from "../../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ ctx }) => ok(await giveConsent(ctx), { status: 201 }));
