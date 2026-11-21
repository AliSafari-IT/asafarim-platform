import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { getJobmatchDb } from "../../../../lib/db/client";
import { SKILLS_LAYOUTS, isSkillsLayout, type SkillsLayout } from "../../../../lib/tailoring/skillsLayout";

export const dynamic = "force-dynamic";

/**
 * Display choices on one tailored CV. The CV's content is never touched
 * here. Each field is optional; only the ones sent change.
 * - `showPhoto`: true/false records the candidate's choice for this CV,
 *   null goes back to following the profile's default.
 * - `skillsLayout`: "grouped" | "columns" | "paragraph", or null for the
 *   automatic choice (lib/tailoring/skillsLayout.ts). "paragraph" is only
 *   accepted once the CV has a checked paragraph; it is written by
 *   POST /api/tailor/[id]/skills-paragraph.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: { showPhoto?: unknown; skillsLayout?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const data: { showPhoto?: boolean | null; skillsLayout?: SkillsLayout | null } = {};
  if ("showPhoto" in body) {
    const { showPhoto } = body;
    if (showPhoto !== null && typeof showPhoto !== "boolean") {
      return NextResponse.json(
        { error: "showPhoto must be true, false or null." },
        { status: 400 }
      );
    }
    data.showPhoto = showPhoto;
  }
  if ("skillsLayout" in body) {
    const { skillsLayout } = body;
    if (skillsLayout !== null && !isSkillsLayout(skillsLayout)) {
      return NextResponse.json(
        { error: `skillsLayout must be one of ${SKILLS_LAYOUTS.join(", ")}, or null.` },
        { status: 400 }
      );
    }
    data.skillsLayout = skillsLayout;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { id } = await params;
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's CV. The paragraph layout needs a paragraph to show.
  const updated = await getJobmatchDb().tailoredResume.updateMany({
    where: {
      id,
      workspaceId: workspace.id,
      ...(data.skillsLayout === "paragraph" ? { skillsParagraph: { not: null } } : {}),
    },
    data,
  });
  if (updated.count === 0) {
    if (data.skillsLayout === "paragraph") {
      const exists = await getJobmatchDb().tailoredResume.count({ where: { id, workspaceId: workspace.id } });
      if (exists > 0)
        return NextResponse.json(
          { error: "Write the skills paragraph first.", code: "no_paragraph" },
          { status: 409 }
        );
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(data);
}
