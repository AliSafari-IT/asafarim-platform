import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { configureAuditStream } from "../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const b = (await req.json().catch(() => ({}))) as { url?: string };
  return ok(await configureAuditStream(ctx, b.url ?? ""), { status: 201 });
});
