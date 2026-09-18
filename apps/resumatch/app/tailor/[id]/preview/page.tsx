import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { ClassicTemplate } from "../../../../components/tailoring/templates/Classic";
import { getJobmatchDb } from "../../../../lib/db/client";
import { parseTailoredResumeContent } from "../../../../lib/tailoring/ai/schema";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Preview" };
export const dynamic = "force-dynamic";

export default async function TailoredResumePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's tailored resume.
  const row = await db.tailoredResume.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { content: true, degraded: true },
  });
  if (!row) notFound();

  const content = parseTailoredResumeContent(row.content);

  return (
    <>
      <PageHeader kicker="Tailor" title="Your tailored CV" />

      {row.degraded ? (
        <Alert tone="warning">
          This version could not be AI-tailored right now (budget or provider issue), so it shows
          your confirmed profile carried over unchanged. Try generating it again later.
        </Alert>
      ) : null}

      <div className="rm-preview-toolbar">
        <PrintButton />
      </div>

      <ClassicTemplate content={content} />
    </>
  );
}
