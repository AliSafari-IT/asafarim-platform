import { NextResponse, type NextRequest } from "next/server";
import { MAX_HANDOFF_BYTES } from "@asafarim/tool-handoff";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { isSameOriginJson } from "@/lib/server/same-origin";
import { confirmWorkbenchImport } from "@/lib/server/services/workbench-import";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

// POST { content, title } → creates the timeline once per user and handoff id.
export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginJson(req)) return NextResponse.json({ ok: false, code: "forbidden", message: "Import from TimelineAI's own import page." }, { status: 403, headers });
    const body = (await req.json().catch(() => null)) as { content?: unknown; title?: unknown } | null;
    const content = typeof body?.content === "string" ? body.content : "";
    if (content.length > MAX_HANDOFF_BYTES) return NextResponse.json({ ok: false, code: "too_large", message: "This file is too large to import." }, { status: 413, headers });
    const title = typeof body?.title === "string" ? body.title : "";
    const result = await confirmWorkbenchImport(content, await getViewerContext(), title);
    const status = result.ok ? (result.status === "created" ? 201 : 200) : result.code === "sign_in" ? 401 : 422;
    return NextResponse.json(result, { status, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
