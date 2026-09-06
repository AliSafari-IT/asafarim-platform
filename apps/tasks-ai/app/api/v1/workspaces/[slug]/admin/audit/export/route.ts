import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { exportAuditCsv } from "../../../../../../../../lib/admin/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const csv = await exportAuditCsv(ctx, p);
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="audit.csv"' } });
});
