import { workspaceRoute } from "../../../../../../lib/api/handler";
import { exportWorkspace } from "../../../../../../lib/export/workspace";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const { contentType, filename, body } = await exportWorkspace(ctx, format);
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});
