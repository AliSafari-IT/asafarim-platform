import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { getProposal } from "../../../../../../../../lib/ai/proposals";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => ok(await getProposal(ctx, params.id)));
