import { NextResponse } from "next/server";
import { MAX_HANDOFF_BYTES } from "@asafarim/tool-handoff";
import { isSameOriginJson } from "@/lib/same-origin";
import { previewWorkbenchImport, validateWorkbenchFile } from "@/lib/workbench-import";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

// POST { content } → exactly what confirm would create. Never writes; any signed-in member may preview.
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ ok: false, code: "forbidden", message: "Import from Testora's own import page." }, { status: 403, headers });
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content : "";
  if (content.length > MAX_HANDOFF_BYTES) return NextResponse.json({ ok: false, code: "too_large", message: "This file is too large to import." }, { status: 413, headers });
  const checked = validateWorkbenchFile(content);
  if (!checked.ok) return NextResponse.json(checked, { status: 422, headers });
  return NextResponse.json({ ok: true, ...previewWorkbenchImport(checked.envelope) }, { headers });
}
