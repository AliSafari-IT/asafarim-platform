import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createFeedback, listFeedback } from "../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const u = new URL(req.url);
  return ok(await listFeedback(ctx, { state: u.searchParams.get("state") ?? undefined, overdueOnly: u.searchParams.get("overdue") === "true" }));
});
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createFeedback(ctx, await req.json().catch(() => ({}))), { status: 201 }));
