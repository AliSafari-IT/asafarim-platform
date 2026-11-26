import { NextResponse } from "next/server";
import { calendarResponse, followUpDownload } from "../../../../../../lib/applications/calendar/service";
import { getTranslator } from "../../../../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** The application's follow-up date as a one-time .ics download (#969).
 *  Owner only: another workspace's id is a 404. Read-only: nothing about
 *  the application changes, and nothing is sent to anyone. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { t } = await getTranslator();
  return calendarResponse(await followUpDownload(workspace.id, id, t));
}
