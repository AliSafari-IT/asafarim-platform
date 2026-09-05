import { route } from "../../../../lib/api/handler";
import { ok } from "../../../../lib/api/http";
import { createWorkspace, listMyWorkspaces } from "../../../../lib/services/workspaces";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return ok(await listMyWorkspaces());
});

export const POST = route(async (req, cid) => {
  const body = await req.json().catch(() => ({}));
  const workspace = await createWorkspace(body, cid);
  return ok(workspace, { status: 201 });
});
