import { NextResponse } from "next/server";
import { ApplicationNotFoundError, createApplication, listApplicationPage } from "../../../lib/applications/service";
import { parseApplicationListQuery } from "../../../lib/applications/listQuery";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/** One page of the caller's applications (issue #897). Takes the same
 *  query parameters as /applications (lib/applications/listQuery.ts):
 *  `q`, `status`, `due` + `today`, `sort`, `page`, `pageSize` (default 20,
 *  at most 100). Malformed parameters are a 400 that names them, never a
 *  silently widened result; a page past the end is an empty page. The
 *  search text is never logged. */
export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const parsed = parseApplicationListQuery(new URL(request.url).searchParams, "strict");
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid query parameters.", invalid: parsed.invalid }, { status: 400 });
  }

  const result = await listApplicationPage(workspace.id, parsed.query);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { targetJobId, tailoredResumeId, notes } = (body ?? {}) as {
    targetJobId?: unknown;
    tailoredResumeId?: unknown;
    notes?: unknown;
  };
  if (typeof targetJobId !== "string") {
    return NextResponse.json({ error: "targetJobId is required." }, { status: 400 });
  }

  try {
    const application = await createApplication(workspace.id, {
      targetJobId,
      tailoredResumeId: typeof tailoredResumeId === "string" ? tailoredResumeId : null,
      notes: typeof notes === "string" ? notes : null,
    });
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
