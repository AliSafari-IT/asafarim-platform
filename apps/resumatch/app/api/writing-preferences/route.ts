import { NextResponse } from "next/server";
import { parseWritingPreferences } from "../../../lib/writingPreferences/contract";
import {
  deleteWritingPreferences,
  getWritingPreferences,
  saveWritingPreferences,
} from "../../../lib/writingPreferences/store";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Saved writing preferences (#931).
 * - GET: the current revision, or `{ current: null }`.
 * - PUT `{ preferences, baseRevisionId }`: saves a new revision on top of
 *   the one the client saw (null: none). 409 `PREFERENCES_STALE` with the
 *   current revision when another save landed first; 422 with a `code`
 *   (and `field` for a style note) when the values are not valid. Empty
 *   preferences are a reset to the defaults.
 * - DELETE: removes every revision.
 * A save affects future tailoring runs only: previews and CVs keep the
 * settings they were made with.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return NextResponse.json({ current: await getWritingPreferences(workspace.id) });
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
  const { preferences, baseRevisionId } = (body ?? {}) as { preferences?: unknown; baseRevisionId?: unknown };
  if (baseRevisionId !== null && typeof baseRevisionId !== "string") {
    return NextResponse.json({ error: "baseRevisionId is required (null when none was saved).", code: "invalid" }, { status: 400 });
  }
  const parsed = parseWritingPreferences(preferences);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid writing preferences", code: parsed.error, field: parsed.field ?? null },
      { status: 422 },
    );
  }
  const result = await saveWritingPreferences(workspace.id, parsed.value, baseRevisionId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Your writing preferences changed elsewhere.", code: "PREFERENCES_STALE", current: result.current },
      { status: 409 },
    );
  }
  return NextResponse.json({ current: result.current, changed: result.changed });
}

export async function DELETE() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  await deleteWritingPreferences(workspace.id);
  return NextResponse.json({ current: null });
}
