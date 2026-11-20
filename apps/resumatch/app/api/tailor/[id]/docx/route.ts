import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { parseTailoredResumeContent } from "../../../../../lib/tailoring/ai/schema";
import { renderTailoredResumeDocx } from "../../../../../lib/tailoring/docx";
import { getCurrentWorkspace } from "../../../../../lib/workspace";
import { cvShowsPhoto } from "../../../../../lib/profile/photo";
import { getProfilePhoto, readProfilePhotoBytes } from "../../../../../lib/profile/photoStore";

export const dynamic = "force-dynamic";

/**
 * DOCX download for a tailored resume (issue #435). Serializes the exact
 * same `TailoredResumeContent` the print/preview page renders — see
 * lib/tailoring/docx.ts — so the two exports can never diverge.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's tailored resume.
  const row = await db.tailoredResume.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { content: true, outputLanguage: true, showPhoto: true },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const content = parseTailoredResumeContent(row.content);
  // The photo, when this CV shows it, comes from its own row and object —
  // never from `content`. A photo that can't be read is left out rather
  // than failing the download.
  const profilePhoto = await getProfilePhoto(workspace.id);
  const photoBytes = cvShowsPhoto(profilePhoto, row.showPhoto) ? await readProfilePhotoBytes(workspace.id) : null;
  const buffer = await renderTailoredResumeDocx(
    content,
    row.outputLanguage,
    profilePhoto && photoBytes ? { data: photoBytes, shape: profilePhoto.shape } : null,
  );
  const filename = (content.fullName ?? "resume").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "resume";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}.docx"`,
    },
  });
}
