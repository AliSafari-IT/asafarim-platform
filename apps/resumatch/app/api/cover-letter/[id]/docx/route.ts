import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { parseCoverLetterContent } from "../../../../../lib/tailoring/ai/coverLetter/schema";
import { renderCoverLetterDocx } from "../../../../../lib/tailoring/coverLetterDocx";
import { buildLetterLayout } from "../../../../../lib/tailoring/coverLetterLayout";
import { parseProfileContent } from "../../../../../lib/profile/contract";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * DOCX download for a cover letter (issue #457). Serializes the exact same
 * `CoverLetterContent` the print/preview page renders — see
 * lib/tailoring/coverLetterDocx.ts — so the two exports can never diverge.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's cover letter.
  const row = await db.coverLetter.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      content: true,
      outputLanguage: true,
      createdAt: true,
      profileVersion: { select: { content: true } },
      targetJob: { select: { title: true, employer: true, structuredFields: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const content = parseCoverLetterContent(row.content);
  const profile = parseProfileContent(row.profileVersion.content);
  // Same frame as the print view (coverLetterLayout.ts): sender, recipient,
  // place and date, subject — all copied from confirmed data in code.
  const layout = buildLetterLayout(
    { fullName: content.fullName, email: profile.email, phone: profile.phone, baseLocation: profile.baseLocation },
    row.targetJob,
    row.createdAt,
    row.outputLanguage,
  );
  const buffer = await renderCoverLetterDocx(content, row.outputLanguage, layout);
  const filename =
    (content.fullName ? `${content.fullName}-cover-letter` : "cover-letter")
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "cover-letter";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}.docx"`,
    },
  });
}
