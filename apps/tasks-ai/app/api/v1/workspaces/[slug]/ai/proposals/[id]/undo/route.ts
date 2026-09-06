import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { undoProposal } from "../../../../../../../../../lib/ai/proposals";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ ctx, params }) => ok(await undoProposal(ctx, params.id)));
