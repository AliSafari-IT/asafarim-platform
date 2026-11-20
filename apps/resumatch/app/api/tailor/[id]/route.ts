import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { getJobmatchDb } from "../../../../lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Display choices on one tailored CV. Today that is only `showPhoto`:
 * true/false records the candidate's choice for this CV, null goes back to
 * following the profile's default. The CV's content is never touched here.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: { showPhoto?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const { showPhoto } = body;
  if (showPhoto !== null && typeof showPhoto !== "boolean") {
    return NextResponse.json(
      { error: "showPhoto must be true, false or null." },
      { status: 400 }
    );
  }

  const { id } = await params;
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's CV.
  const updated = await getJobmatchDb().tailoredResume.updateMany({
    where: { id, workspaceId: workspace.id },
    data: { showPhoto },
  });
  if (updated.count === 0)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ showPhoto });
}
