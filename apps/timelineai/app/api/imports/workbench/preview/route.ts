import { NextResponse, type NextRequest } from "next/server";
import { MAX_HANDOFF_BYTES } from "@asafarim/tool-handoff";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { isSameOriginJson } from "@/lib/server/same-origin";
import { previewWorkbenchImport } from "@/lib/server/services/workbench-import";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

// POST { content } → what would be created. Never writes.
export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginJson(req)) return NextResponse.json({ ok: false, code: "forbidden", message: "Import from TimelineAI's own import page." }, { status: 403, headers });
    const viewer = await getViewerContext();
    if (!viewer.userId) return NextResponse.json({ ok: false, code: "sign_in", message: "Sign in to import into TimelineAI." }, { status: 401, headers });
    const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
    const content = typeof body?.content === "string" ? body.content : "";
    if (content.length > MAX_HANDOFF_BYTES) return NextResponse.json({ ok: false, code: "too_large", message: "This file is too large to import." }, { status: 413, headers });
    const result = previewWorkbenchImport(content);
    return NextResponse.json(result, { status: result.ok ? 200 : 422, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
