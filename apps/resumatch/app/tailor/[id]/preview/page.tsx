import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { ClassicTemplate } from "../../../../components/tailoring/templates/Classic";
import { getJobmatchDb } from "../../../../lib/db/client";
import { parseTailoredResumeContent } from "../../../../lib/tailoring/ai/schema";
import { computeCoverage } from "../../../../lib/tailoring/coverage";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { CoverageReport } from "./CoverageReport";
import { DocxButton } from "./DocxButton";
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
    select: { content: true, degraded: true, targetJob: { select: { rawText: true } } },
  });
  if (!row) notFound();

  const content = parseTailoredResumeContent(row.content);

  // Derived at render, never stored: the same "coverage describes the
  // document, it never becomes part of it" boundary the rest of tailoring
  // enforces. See lib/tailoring/coverage.ts.
  const resumeText = [
    content.headline,
    content.summary,
    content.skills.join(" "),
    ...content.experience.flatMap((entry) => [entry.title, entry.employer, ...entry.bullets]),
  ]
    .filter(Boolean)
    .join(" ");
  const coverage = row.targetJob.rawText ? computeCoverage(content.skills, row.targetJob.rawText, resumeText) : null;

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
        <DocxButton id={id} />
      </div>

      {coverage ? <CoverageReport coverage={coverage} /> : null}

      <ClassicTemplate content={content} />
    </>
  );
}
