import { NextResponse } from "next/server";
import { buildMyJobCsv } from "../../../../lib/export/myJobCsv";
import { listTrackedJobs } from "../../../../lib/tracking/service";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The `My-Job` CSV download (JM-051, JM-053).
 *
 * Reads only the caller's own tracked jobs — there is no id in this request
 * a client could substitute to reach another candidate's export, since the
 * workspace comes from the session, never from a query parameter.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const items = await listTrackedJobs(workspace.id);
  const csv = buildMyJobCsv(
    items.map((item) => ({
      status: item.status,
      title: item.jobPosting.title,
      employer: item.jobPosting.employer,
      location: item.jobPosting.locationRaw,
      canonicalUrl: item.jobPosting.canonicalUrl,
      notes: item.notes,
      appliedAt: item.appliedAt,
      interviewAt: item.interviewAt,
      followUpAt: item.followUpAt,
      trackedSince: item.createdAt,
    })),
  );

  await recordAuditEvent(workspace.id, "tracking.exported", { count: items.length });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // A candidate re-downloading their own export should not silently
      // overwrite a file already sitting in their downloads folder with
      // the same name — the date makes each day's export distinct.
      "content-disposition": `attachment; filename="my-jobs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
