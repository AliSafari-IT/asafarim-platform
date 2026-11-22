import { NextResponse } from "next/server";
import { parseContactPreferences } from "../../../lib/contactPreferences/contract";
import { getContactPreferences, saveContactPreferences } from "../../../lib/contactPreferences/store";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Contact preferences (#940). GET returns the saved defaults (null when
 * none). PUT saves them; `{ "preferences": null }` removes them, so emails
 * go back to having no contact paragraph.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return NextResponse.json({ preferences: await getContactPreferences(workspace.id) });
}

export async function PUT(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "invalid" }, { status: 400 });
  }
  const raw = (body as { preferences?: unknown } | null)?.preferences;
  if (raw === null) {
    await saveContactPreferences(workspace.id, null);
    return NextResponse.json({ preferences: null });
  }
  const parsed = parseContactPreferences(raw);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid contact preferences", code: parsed.error }, { status: 422 });
  await saveContactPreferences(workspace.id, parsed.value);
  return NextResponse.json({ preferences: parsed.value });
}
