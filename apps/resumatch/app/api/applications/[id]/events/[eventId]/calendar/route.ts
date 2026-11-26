import { NextResponse } from "next/server";
import { calendarResponse, interviewDownload } from "../../../../../../../lib/applications/calendar/service";
import { getTranslator } from "../../../../../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** An interview entry as a one-time .ics download (#969). Owner only:
 *  another workspace's application or entry is a 404. Read-only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { t, locale } = await getTranslator();
  return calendarResponse(await interviewDownload(workspace.id, id, eventId, t, locale));
}
