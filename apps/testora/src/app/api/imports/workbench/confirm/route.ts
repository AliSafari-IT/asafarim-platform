import { NextResponse } from "next/server";
import { auth, isAdmin } from "@asafarim/auth";
import { MAX_HANDOFF_BYTES } from "@asafarim/tool-handoff";
import { isSameOriginJson } from "@/lib/same-origin";
import { confirmWorkbenchImport } from "@/lib/workbench-import-service";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

// POST { content, projectId } → creates the pending scenarios once per handoff id. Admins only (the proxy enforces it too).
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) return NextResponse.json({ ok: false, code: "forbidden", message: "Import from Testora's own import page." }, { status: 403, headers });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, code: "sign_in", message: "Sign in to import into Testora." }, { status: 401, headers });
  if (!isAdmin(session)) return NextResponse.json({ ok: false, code: "forbidden", message: "Only Testora admins can create requirements and scenarios. Ask an admin to import this file." }, { status: 403, headers });
  const body = (await request.json().catch(() => null)) as { content?: unknown; projectId?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content : "";
  if (content.length > MAX_HANDOFF_BYTES) return NextResponse.json({ ok: false, code: "too_large", message: "This file is too large to import." }, { status: 413, headers });
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const result = await confirmWorkbenchImport(content, projectId, session.user.id);
  return NextResponse.json(result, { status: result.ok ? (result.status === "created" ? 201 : 200) : 422, headers });
}
